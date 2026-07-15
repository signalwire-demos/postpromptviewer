# Plan: Bring the viewer in line with the enriched call_log format

> **Status (2026-07-15):** All phases implemented — §1.1–§1.11, §2.1–§2.6
> (§2.5 recording anchor + stamps_us waveform markers; wav analyzer
> cross-validation itself not ported — no audio-analysis stack in this app),
> and Phase 3 polish (clean_text, est. cost, DTMF chip). New Trace tab
> (`src/components/trace.js` + `lib/metrics/trace.js`) and scorecards
> (`lib/metrics/scorecard.js`). Verified by `npm test` (19 tests, synthetic
> fixtures in `tests/`) and `npm run build`. Pending review against freshly
> collected post_prompt examples.

Target spec: `ENRICHED_CALL_LOG.md` (repo root — the canonical version; the copies inside
`post_prompt_viewer/` are older). Reference implementation: `post_prompt_viewer/`
(`src/post_prompt_viewer/enrich.py` + templates/static JS), which implements the new
format. This plan lists every difference found between our app (`lib/`, `src/`,
`backend/`) and the new data / reference app, grouped into phases.

> Where the reference app itself deviates from the canonical spec, we implement the
> **spec**, not the reference — those spots are called out in §4.

---

## Phase 1 — Correctness: read the new data the way the spec says

### 1.1 Tool identity: use `function_name`, stop index/timestamp matching
- `toolEntry.function_name` is never read anywhere in our code. Instead:
  - `src/components/timeline.js:72-82,246-253` assigns names to tool entries from a FIFO
    queue of assistant `tool_calls[].function.name` by array position — breaks on
    parallel/dropped calls.
  - `lib/metrics/tools.js:31-55` matches `swaig_log` to tool entries by a 5-second
    timestamp window — the exact anti-pattern the spec deprecates.
- Fix: read `function_name` directly off tool entries everywhere; correlate tool result ↔
  assistant request via `tool_call_id`/`id` (the consumer-facing key per spec). Keep
  `swaig_log` only for detail (args, `post_response`, url), paired by name + order.

### 1.2 Tool latency semantics are inverted
- `lib/metrics/latency.js:47-48`, `tools.js:49-53`, `charts.js:585-644`,
  `dashboard.js:126-129` treat `execution_latency` as "round-trip" and
  `function_latency` as "remote-only", deriving "network overhead" from their difference.
- Per spec, both are **aliases of the surrounding LLM turn's** `audio_latency` /
  `utterance_latency` — not the tool's own timing. The function's real execution time is
  `end_timestamp − start_timestamp` (μs → ms), which we never compute.
- Fix: recompute all SWAIG-latency stats/charts from `end_timestamp − start_timestamp`;
  relabel or drop the alias-based stats. Surface `distilled` / `original_result` on tool
  entries while here.

### 1.3 Flat-key system-log actions: unrecognized or read from the wrong place
- The spec defines two emission shapes. Seven actions carry fields as **flat top-level
  keys with no `metadata`**: `function_error`, `function_loop`, `swaig_problem`,
  `change_step_failed`, `double_turn`, `inner_dialog`, `inner_dialog_scorecard`.
- Our handlers all read `entry.metadata.*` (`lib/metrics/enriched.js:26`,
  `src/components/transcript.js:204`, `state-flow.js:504,834`, `timeline.js:92`,
  `recording.js:243`), so flat-key fields are dropped.
- `function_loop`, `swaig_problem`, `change_step_failed`, `double_turn`,
  `inner_dialog_scorecard`, `check_for_input` are entirely unrecognized (zero hits).
- `function_error` reads the **non-production** `error_type`/`http_code` shape
  (`transcript.js:219`, `state-flow.js:904-912`); production emits `function` / `error`
  ("non-existent function" | "invalid parameters") / `details`.
- Fix: add a small accessor (`fieldsOf(entry)` → metadata if present, else entry top
  level) used by every system-log handler; add renderers for the six missing actions;
  fix `function_error` to the production shape. These actions also never reach
  `call_timeline` — only `call_log`/`raw_call_log` — so the timeline builders must not
  expect them there.

### 1.4 Null vs 0 sentinel semantics on latency fields
- `latency.js:26-29`, `timeline.js:223`, and `backend/services/extractor.py:130,160`
  collapse JSON `null` to `0` (`|| 0`, `> 0` filters). Spec: `null` = "not measured",
  distinct from the `0` sentinel that appears on `assistant-manual` entries
  (`latency`/`utterance_latency`/`audio_latency` always present there as `0`).
- Fix: use `?? null` throughout, exclude nulls from averages/percentiles without zeroing,
  and special-case manual entries (0 = "no acoustic origin", not a real measurement).
  `acoustic_latency` already does this correctly (`latency.js:46,79`) — extend the same
  pattern to the other tiers.

### 1.5 Wrong field names on enriched actions (values always blank today)
- `reset`: we read `reset_type`/`type` (`timeline.js:151`, `state-flow.js:850`); spec is
  `consolidate` / `full_reset`.
- `gather_question`: we read `m.type` (`state-flow.js:872`); spec is `question_type`.
- `gather_complete`: we read `answered_count`/`action` (`state-flow.js:897-899`); spec is
  `answered` / `completion_action`.
- `context_enter`: use `to_context`/`from_context`/`isolated`, not the auto-stamped
  `context` fallback (`timeline.js:141`, `state-flow.js:842`).
- Drop the invented actions `pronounce_rule` (`enriched.js:45`, `timeline.js:124`) and
  `change_step` (`recording.js:94`), or keep only as legacy fallbacks.

### 1.6 `times[]`: match by response text, not index
- `latency.js:136`, `tokens.js:8` map `times[]` positionally (`R${i+1}` labels);
  tool-round discrimination is a word-count heuristic (`latency.js:137`).
- Spec: `times[]` is per-generation (includes abandoned/barged regenerations and
  tool-only rounds); index N ≠ Nth spoken turn. Reference does consumed-pool
  prefix/equality text matching (`enrich.py:293-311` `_match_perf`).
- Fix: port `_match_perf`-style matching; attach per-turn perf (tps/answer_time/tokens)
  to spoken assistant turns; keep unmatched generations visible as "regenerated/tool
  rounds" rather than silently mixed into per-turn charts.

### 1.7 Barge metadata plumbing
- We correctly source barge from `raw_call_log` with a `call_timeline` fallback
  (`lib/parser.js:117-155`) but merge onto blessed `call_log` by μs-timestamp join —
  collides on shared timestamps. Reference keys by stripped
  `text_spoken_total`/content match (`enrich.py:696-706`).
- Downstream defensive reads `msg.barged ?? msg.metadata?.barged` can stay, but the
  join should move to content matching.
- Add the reference's "unheard tail" rendering: struck-through remainder of
  `text_spoken_total` after `text_heard_approx`, plus % heard.

### 1.8 Synthetic timeline events (`text_normalize` / `pronounce`)
- Spec: these exist **only** as synthetic `call_timeline` events, never as `call_log`
  actions. Our transcript/enriched paths read `text_normalize` as a call_log action
  (dead code: `enriched.js:64`, `transcript.js:227`) and only `state-flow.js` reads it
  from the timeline. The `direction: "tn"` branch (`enriched.js:66`,
  `transcript.js:229,395-402`) is dead — `text_normalize` only emits `"itn"`; TN
  surfaces as `pronounce`.
- Fix: read both events from `call_timeline` in enriched/transcript/timeline; remove the
  dead call_log-action and `"tn"` branches.

### 1.9 Roles: `assistant-thinking` first-class; filler counting
- `assistant-thinking` is a real role (no metadata, never in `call_timeline`). We only
  detect legacy `content.startsWith('Thinking:')` on system-log entries
  (`timeline.js:24-32`, `recording.js:36-41`); the real role falls through to generic
  rendering and pollutes role-breakdown charts (`conversation.js:12`).
  Fix: render as a collapsible "thinking" block (reference: `enrich.py:347-349`),
  exclude from turn/latency accounting.
- Filler: text-mode fillers produce an `assistant-manual` entry and **no** `filler`
  system-log event (spec) — our `filler`-action counters undercount
  (`enriched.js:49` et al.). A filler's `stamps_us.first_audio` / `acoustic_latency`
  is back-filled and is the exchange's true perceived latency (see 2.1).

### 1.10 Session/hook details never surfaced
- `session_end.reason` (`normal`/`hangup`/`end_call`/`inactivity_timeout`/`hard_stop`) —
  only `ended_by` is read today (`extractor.py:58-66`).
- `hangup_hook` fatal-error path: `fatal_error` / `error_reason`
  (`token_exhaustion`/`llm_fatal`/`llm_max_retries`) and the SWML-transfer response.
- `manual_say.error_reason` legend (llm_retry, invalid_function, …) for error-recovery
  chips.

### 1.11 Inferred user timestamps must be visibly flagged
- `lib/parser.js:166-194` fabricates `start/end_timestamp` from content length when
  absent; `timings_inferred` is set but no consumer surfaces it — synthetic timing is
  charted as real. Fix: badge inferred timings in transcript/timeline/charts, exclude
  from latency stats.

---

## Phase 2 — New data: surface what the format now carries

### 2.1 Full latency pipeline (the biggest visible gap)
Never read today: `eos_to_push_latency`, `dg_decision_latency`, `poll`, the four
`*_wall_us` stamps, and the entire `stamps_us` object.

- Adopt the `stamps_us` unified turn timeline (with `*_wall_us` fallback for the four
  caller stamps, per reference `enrich.py:734-744`): speech_start → last_word_end →
  turn_decided → status_pushed → request_detect → first_token → first_utterance →
  first_audio. Every interval is a subtraction; no anchor math.
- Rebuild the stacked per-turn latency bar per the spec's breakdown table: turn
  detection (`eos_to_push_latency`, with `dg_decision_latency` as its inner segment) →
  `poll` → model TTFT (`latency`) → utterance (`utterance_latency − latency`) → audio
  (`audio_latency − utterance_latency`), with `acoustic_latency` as the full-extent
  "user-perceived" reference. Current bar (`lib/metrics/latency.js:25-50`,
  `charts.js:82-322`) covers only the model+delivery half and never charts
  `acoustic_latency`.
- Filler anchoring: on tool-backed exchanges the **filler's** `first_audio` /
  `acoustic_latency` is the true mouth-to-ear number; the response's shows time-to-real-
  answer. Reference: `enrich.py:796-799,885`.
- Per-turn "mouth-to-ear" headline (`first_audio − last_word_end`) with speed classes
  (fast <1500 ms / ok <3000 ms / slow), avg/median/p95 rollup.

### 2.2 User-turn ASR telemetry (`entity` / `eot` / `timing`)
Entirely unconsumed today (also `speaker`).
- `entity {type, value, valid}` — chips on user turns (✓/✕ by `valid`), read back the
  canonical value; an "entities captured" rollup card (reference `detail.html:175-183`).
- `eot {basis, confidence}` — turn-end verdict per turn; warn on `basis: "ceiling"`
  (low confidence → consider re-prompt) and low confidence (<60%).
- `timing {hold_ms, commit_latency_ms, segments, walkbacks}` — dictation-hold
  observability; `commit_latency_ms` is the authoritative hold measure. Note: the
  reference forgot `walkbacks` — we should surface it.
- All three blocks are conditional (absent on DTMF/injected/unenriched turns) — test
  presence.
- Optional: port the reference's plain-English turn-taking `_verdict`
  (snap/instant/held/uncertain/forced, `enrich.py:610-640`).

### 2.3 Trace / exchange grouping view
Reference groups `call_log` into exchanges (user turn → tools → AI reply; greeting
handled; post-prompt summary text filtered out; thinking/system never perturb grouping —
`enrich.py:766-825`) and renders one card per exchange with the stamp bar, verdict, and
collapsible SWAIG detail. Our transcript is entry-per-row and our timeline is
event-per-row; adopt an exchange-grouped view (either evolving `timeline.js` or a new
component).

### 2.4 Scorecards
- `global_data.scorecard` → bars with good/bad coloring (frustration inverted).
- `inner_dialog_scorecard` system-log entries → parse metrics from `content`
  (reference `parse_scorecard_text`, `enrich.py:1103-1115`).

### 2.5 Recording alignment & cross-validation (if/when we analyze audio)
- Prefer `SWMLVars.record_first_frame` over `record_call_start` as the recording anchor
  (`recording.js` currently anchors on `record_call_start` semantics via parser).
- Recording-relative seek for any stamp: `stamp − record_first_frame`.
- If we add wav analysis: compare wav-measured H→AI latency against the stamp-derived
  `acoustic_stamp = first_audio − last_word_end` first, `acoustic_latency` field second,
  `audio_latency` last (reference `align_latency`, `enrich.py:507-595`); nearest-in-time
  match within 3 s; flag field-vs-stamp disagreement.
- Waveform milestone markers (EOT / first token / first audio) from `stamps_us`.

### 2.6 Backend extractor parity (`backend/services/extractor.py`)
- Fix null-collapse in latency averages (1.4).
- Add index columns/flags: `has_errors` (spec-shape error actions + `manual_say.is_error`
  + fatal `session_end`), `has_barge` (**from `raw_call_log`**, not blessed),
  `has_entities`, avg mouth-to-ear (`acoustic_latency`), `session_end.reason`.
- Consider indexing `call_timeline` presence and enriched-telemetry presence for
  filtering.

---

## Phase 3 — Polish / parity extras (optional)

- Perf chips on assistant turns from text-matched `times[]` (tps, answer_time, tokens).
- `clean_text`: strip inline `~LN(...)-;` TTS language directives wherever text renders
  (reference `enrich.py:141-149`).
- Estimated AI cost (`total_minutes × $0.16`) on the dashboard.
- DTMF `content_type` special-casing on user turns.
- Blessed/raw toggle already exists (`transcript.js:630`) — make raw view the place
  barge/evicted entries are explained.

---

## §4 Reference-app bugs — do NOT copy

Found while auditing `post_prompt_viewer/` (worth reporting upstream):
1. `has_barge` computed over blessed `call_log` where barge fields never appear
   (`enrich.py:249`) — flag ~always false.
2. Flat-key system-log actions read metadata-only in `build_events`/`build_transcript`
   (`enrich.py:397-404,1143`) — fields dropped; only `_has_errors` dual-reads.
3. `_event_title` for `function_error` uses non-production `error_type`/`http_code`
   (`enrich.py:1050`).
4. `timing.walkbacks` never surfaced.
5. `text_normalize`/`pronounce` reachable only via Waterfall (Events skips `cat=="edit"`,
   `enrich.py:1141`).
6. SWAIG↔tool-entry pairing is positional, not `tool_call_id`-correlated
   (`enrich.py:1169-1178`).

---

## Suggested sequencing

1. **Parser/accessor layer** (1.3 accessor, 1.4 null semantics, 1.7 barge join, 1.8
   synthetic events, `stamps_us` extraction) — one PR touching `lib/parser.js` +
   `lib/metrics/*`, with fixtures for both system-log shapes.
2. **Tool identity + tool latency** (1.1, 1.2) — transcript/timeline/tools/charts.
3. **Latency pipeline rebuild** (2.1) — `lib/metrics/latency.js` + `charts.js` +
   timeline; the highest-value user-visible change.
4. **ASR telemetry + verdicts** (2.2) — transcript chips + dashboard rollup.
5. **System-log action coverage + session/hook detail** (1.3 renderers, 1.5, 1.9, 1.10).
6. **times[] text matching** (1.6) and extractor parity (2.6).
7. **Trace view + scorecards + recording alignment** (2.3–2.5) as follow-on features.
