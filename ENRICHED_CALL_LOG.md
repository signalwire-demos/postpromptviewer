# Enriched call_log Format

The `call_log` in an AI agent's `post_data` payload is self-describing: each
event carries typed fields, so consumers read them directly instead of parsing
`content` strings or matching parallel arrays by timestamp. User, assistant, and
tool entries expose those fields flattened to top level; system-log entries
expose them either in a nested `metadata` object or as flat top-level keys
depending on the emitting path (see [Payload structure](#payload-structure)).
This document is the canonical reference for the format.

## Payload structure

The full post_data payload carries all of the arrays below (assembled in `ais_get_post_data` in `ai_utils.c`, with `swaig_log` added by `post_process.c`). `call_timeline` is present only when at least one entry has a `metadata` object.

| Array | Contents |
|---|---|
| `call_log[]` | The blessed conversation log — user / assistant / tool / system-log entries. System-log entries keep a nested `metadata` object; user/assistant/tool entries have their `metadata` flattened to top level. Built from the filtered `array` (sliding-window-evicted, consolidated, step-hidden entries removed). |
| `raw_call_log[]` | The unfiltered append-only record — same per-entry shape as `call_log`, built from `raw_array`. Carries entries `call_log` omits (e.g. barge metadata, evicted turns). |
| `call_timeline[]` | A flat event stream derived from `raw_array` (so it aligns with `raw_call_log`, not `call_log`), with each entry's `metadata` flattened to top level plus a `ts` and a `type`. A convenience view. Most of its data is also reachable on the source entries, but it is **not** a strict subset of `call_log`: it includes barge fields (raw-only) and synthetic `text_normalize` / `pronounce` events, and it flattens system-log metadata that stays nested in `call_log`. |
| `times[]` | Per-generation LLM metrics (one entry per round-trip). |
| `swaig_log[]` | Full per-function-call record (args, results, post_response actions). |

- **System-log entries** carry an `action` field and a human-readable `content` string, plus typed event fields (step changes, gather flow, session lifecycle, …). They are emitted via **two paths with different field shapes** — this distinction governs whether an entry reaches `call_timeline`:
  - **`tl_*` helpers (`timeline.c`)** build a **nested `metadata` object**. Because they have `metadata`, `build_call_timeline` emits them into `call_timeline`. This is the majority of actions (step_change, context_enter, reset, gather_*, function_call, session_start/end, attention_timeout, filler, startup_hook, hangup_hook, summarize_start, check_for_input, manual_say, hearing_hint, auto_correct).
  - **`ai_conversation_system_log` (`conversation.c`)** writes its fields as **flat top-level keys with no `metadata` object**. These entries appear in `call_log` / `raw_call_log` (system-log entries pass through verbatim) but are **skipped by `build_call_timeline`** (no `metadata`), so they do **not** appear in `call_timeline`. This path emits: `function_error`, `function_loop`, `swaig_problem`, `change_step_failed`, `double_turn`, `inner_dialog`, `inner_dialog_scorecard`.
- **Tool entries** carry `function_name` in their metadata, so the function name is available without matching `swaig_log[]` by timestamp.

---

## System-log entries

System-log entries pass through to `call_log` / `raw_call_log` **as-is** (no flattening or field rebuild). There are two field shapes depending on which code path emitted the entry:

- **`tl_*` helpers (`timeline.c`)** — the typed event fields live in a **nested `metadata` object** (shown below). These entries reach `call_timeline`.
- **`ai_conversation_system_log` (`conversation.c`)** — the typed fields are **flat top-level keys** directly on the entry (no `metadata` object). These do **not** reach `call_timeline`. This path emits `function_error`, `function_loop`, `swaig_problem`, `change_step_failed`, `double_turn`, `inner_dialog`, `inner_dialog_scorecard`; the rest use the nested-metadata path.

The field tables below list each action's fields regardless of which shape carries them. For the flat-key actions, read the fields off the entry's top level rather than from a `metadata` object.

### Entry shape (nested-metadata path)

```json
{
  "role": "system-log",
  "action": "step_change",
  "lang": "en",
  "timestamp": 1705300001123000,
  "tokens": 0,
  "content": "greet[0] -> collect[1] (ai_function)",
  "content_type": "Detected Speech",
  "metadata": {
    "context": "default",
    "step": "greet",
    "step_index": 0,
    "from_step": "greet",
    "from_index": 0,
    "to_step": "collect",
    "to_index": 1,
    "trigger": "ai_function"
  }
}
```

### action types and their metadata fields

Every nested-metadata system-log entry has `context`, `step`, and `step_index` stamped automatically (when steps are active), via `tl_stamp_location`. The flat-key (`ai_conversation_system_log`) actions do **not** get `context`/`step`/`step_index`.

#### Navigation

**`step_change`** — Step transition completed.

| Field | Type | Description |
|-------|------|-------------|
| `from_step` | string | Name of the step we left |
| `from_index` | number | Index of the step we left |
| `to_step` | string | Name of the step we entered |
| `to_index` | number | Index of the step we entered |
| `trigger` | string | What caused the transition (see trigger values below) |

**`context_enter`** — Context switch.

| Field | Type | Description |
|-------|------|-------------|
| `to_context` | string | Context we're entering |
| `from_context` | string | Context we came from |
| `trigger` | string | What caused the switch |
| `isolated` | boolean | Whether this context runs in isolation |

**`reset`** — Conversation reset.

| Field | Type | Description |
|-------|------|-------------|
| `consolidate` | boolean | Whether conversation was consolidated |
| `full_reset` | boolean | Whether this was a full reset |

#### Trigger values

| Value | Meaning |
|-------|---------|
| `"ai_function"` | Model called `next_step` or `change_context` |
| `"webhook_action"` | Webhook post_response action triggered it |
| `"gather_complete"` | All gather questions answered, `completion_action: "next_step"` |
| `"auto_advance"` | Step's `skip_to_next_step` condition was met |

#### Gather flow

**`gather_start`** — Gather sequence activated on a step.

| Field | Type | Description |
|-------|------|-------------|
| `output_key` | string or null | Key in `global_data` where answers are stored |
| `total_questions` | number | Total questions in this gather |

**`gather_question`** — A question is being presented.

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Answer key name |
| `question_index` | number | 0-based index of this question |
| `question_type` | string | Expected answer type ("string", "integer", etc.) |
| `requires_confirm` | boolean | Whether the model must confirm with the user |

**`gather_answer`** — Answer accepted and stored.

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Answer key name |
| `question_index` | number | Which question this answers |
| `attempt` | number | Attempt number (starts at 0) |
| `confirmed` | boolean | Whether user explicitly confirmed |

**`gather_reject`** — Answer rejected.

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Answer key name |
| `question_index` | number | Which question |
| `attempt` | number | Attempt number |
| `reason` | string | `"confirmation_required"` or `"missing_answer"` |

**`gather_complete`** — All questions answered.

| Field | Type | Description |
|-------|------|-------------|
| `output_key` | string or null | Where answers were stored in global_data |
| `answered` | number | Total questions answered |
| `completion_action` | string or null | e.g. `"next_step"` |

#### Functions

**`function_call`** — A SWAIG function was executed.

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Function name |
| `native` | boolean | true if internal (next_step, change_context, gather_submit, end_call) |
| `duration_ms` | number | Execution time in ms. Omitted when not measured (the code only stamps it when non-zero) |
| `error` | string or null | Error message if the call failed. Omitted when there was no error |

**`function_error`** — The model called a function that could not be dispatched. Emitted from `webhook.c` (`ai_conversation_system_log`).

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Function (tool) name the model tried to call |
| `error` | string | `"non-existent function"` (tool not found) or `"invalid parameters"` (args failed schema validation) |
| `details` | string | Schema-validation error text. Present only on the `"invalid parameters"` case |

> The `error`/`details` shape above is what production actually emits. (A separate `tl_function_error` helper in `timeline.c` exists that would stamp `error_type`/`http_code`, but it has no production callers — ignore it.)

**`function_loop`** — A runaway function-call loop was detected and broken (a system message is injected telling the model the info was already provided). Emitted from `actions.c`.

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Function name that looped |
| `type` | string | `"consecutive"` (>4 functions in a row) or `"repeated"` (same name+args called >2 times) |

**`swaig_problem`** — A SWAIG function webhook (or the startup hook) returned no usable response text or action. Emitted from `actions.c` / `mod_openai.c`.

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Function name (or `"startup_hook"`) |
| `error` | string | `"no response from webhook"` or `"problem response"` |

**`change_step_failed`** — The model (or a webhook action) asked to navigate to a step name that does not exist. Emitted from `actions.c`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | The step name that could not be found |

#### Special Functions

These cover hooks and special SWAIG functions that are not AI-routed function calls.

**`startup_hook`** — Startup hook webhook completed.

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Always `"startup_hook"` |
| `duration_ms` | number | Webhook execution time in ms (omitted when 0) |
| `has_response` | boolean | Whether the webhook returned a response |
| `error` | string or null | Error message if execution failed (omitted on success) |

**`hangup_hook`** — Hangup hook webhook completed.

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Always `"hangup_hook"` |
| `duration_ms` | number | Webhook execution time in ms (omitted when 0) |
| `has_response` | boolean | Whether the webhook returned a response |
| `error` | string or null | Error message if execution failed (omitted on success) |

The hangup hook POST data includes two extra fields when the session ended due to a fatal error:

| POST field | Type | Description |
|------------|------|-------------|
| `fatal_error` | boolean | `true` when the session ended due to a fatal error |
| `error_reason` | string | One of `"token_exhaustion"`, `"llm_fatal"`, `"llm_max_retries"` |

If the webhook response contains an action with `SWML` and `transfer: true`, the call is transferred to that SWML instead of hanging up. Example response:

```json
{
  "response": "Transferring to error handler",
  "action": [{"SWML": "{\"version\":\"1.0.0\",\"sections\":{\"main\":[...]}}", "transfer": true}]
}
```

**`summarize_start`** — Summarize conversation mode activated.

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Always `"summarize_conversation"` |
| `model` | string or null | Model used for summarization |

**`check_for_input`** — Input poll webhook returned a response. Only logged when the webhook actually returns data (not on every poll).

| Field | Type | Description |
|-------|------|-------------|
| `function` | string | Always `"check_for_input"` |
| `duration_ms` | number | Time since last poll in ms (omitted when 0) |

#### Manual Say

**`manual_say`** — System-initiated speech to the user (error recovery, commands, etc.)

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | What was spoken to the user. When `redact_prompt` is on, this is passed through `redact_apply_markers` so PII markers are stripped before logging. `null`/absent only for the `fatal_error_transfer` marker (no spoken text) |
| `is_error` | boolean | Whether this is an error recovery message |
| `error_reason` | string or null | Error type identifier (see legend below) |

**Error reason legend:**

| Reason | Spoken to caller | Meaning | Fatal? |
|--------|-----------------|---------|--------|
| `token_exhaustion` | *(nothing)* | Token limit exhausted after consolidation already attempted | Yes |
| `llm_fatal` | "I'm so sorry, I'm going to have to let you go. I apologize for the inconvenience." | Fatal LLM error (context overflow, invalid request) | Yes |
| `llm_max_retries` | "I'm sorry, I'm not able to continue right now. I apologize for the trouble." | LLM retries exhausted (only spoken if streaming) | Yes |
| `llm_retry` | "Pardon me, I lost my train of thought." | First LLM error, retrying | No |
| `invalid_function` | "Bear with me, I need to rethink that." | Model called a non-existent function | No |
| `invalid_params` | "One moment, let me try a different approach." | Model called a function with parameters that don't match schema | No |
| `webhook_http_failure` | "Just a second, I'm having a little trouble on my end." | Webhook HTTP/CURL failure after retries | No |
| `voice_config_error` | "Excuse me, I need to adjust something." | TTS voice selection/init failed, using gcloud fallback | No |
| `voice_runtime_error` | "Sorry about that, let me get myself sorted out." | TTS engine error during speech output, using gcloud fallback | No |
| `fatal_error_transfer` | *(nothing — NULL text)* | Timeline marker: fatal error recovery transferred the call via hangup hook SWML | No |

Fatal errors (`token_exhaustion`, `llm_fatal`, `llm_max_retries`) set `fatal_error_reason` on the session. When a `hangup_hook` is configured, the hook's POST data includes `"fatal_error": true` and `"error_reason": "<reason>"`. If the hook responds with `{"action": [{"SWML": "...", "transfer": true}]}`, the call is transferred to that SWML instead of hanging up.

#### Text Rewriting

These rewrite **user input** and are emitted as system-log entries (only when the text actually changed).

**`hearing_hint`** — Hearing hints rewrote user input.

| Field | Type | Description |
|-------|------|-------------|
| `original` | string | Input text before rewriting |
| `result` | string | Input text after rewriting |

**`auto_correct`** — LLM-based auto-correction rewrote user input.

| Field | Type | Description |
|-------|------|-------------|
| `original` | string | Raw ASR text before correction |
| `corrected` | string | Text after LLM correction (redacted version if `redact_prompt` is on) |
| `redacted` | boolean | `true` if the corrected text was redacted for PII (only present when redaction occurred) |

> **Pronounce rules and text normalization (ITN/TN) are NOT system-log entries.** The rewrite is stamped as a top-level field on the live conversation entry — ITN on the user entry's `original` field, pronounce/TN on the assistant entry's `pronounced` field. Because the `call_log` / `raw_call_log` serializer (`ai_conversation_json`) rebuilds each user/assistant entry from `role` + `timestamp` + `tool_calls` + flattened `metadata` + `content` only, these top-level fields are **dropped** from both logs. They surface to consumers only as synthetic `text_normalize` / `pronounce` events in `call_timeline`, which `build_call_timeline` derives by reading `original` / `pronounced` directly off the live entry (see [Synthetic events](#synthetic-events)).

#### Session

**`session_start`** — AI session began.

| Field | Type | Description |
|-------|------|-------------|
| `model` | string or null | Model name (e.g. "gpt-4o") |

**`session_end`** — AI session ended.

| Field | Type | Description |
|-------|------|-------------|
| `reason` | string | Why the loop ended. Text mode (`post_process.c`): `"normal"` or `"hard_timeout"`. OART mode (`oart.c`): `"normal"`, `"hangup"`, `"end_call"`, `"inactivity_timeout"`, or `"hard_stop"`. (OART logs `session_end` itself; the text-mode post-process path only logs it when OART hasn't already.) |
| `ended_by` | string | Who ended it. OART: `"caller"` (normal / hangup), `"system"` (inactivity / hard stop), or `"assistant"` (`end_call`). Text mode: the session's `call_ended_by` value if set, else `"system"` |

#### Misc

**`attention_timeout`** — User didn't respond within timeout.

| Field | Type | Description |
|-------|------|-------------|
| `timeout_ms` | number | The configured attention timeout in ms (text mode). OART logs this event with `timeout_ms: 0` — the value isn't available at that call site |

**`filler`** — Filler audio played. Emitted for OART fillers (`oart.c`) and double-turn fillers (`double_turn.c`). Plain text-mode fillers (`maybe_filler` in `ai_utils.c`) speak via `ais_say` and produce an `assistant-manual` entry but do **not** emit a `filler` system-log event.

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Filler text spoken |
| `language` | string | Language code |
| `filler_type` | string | `"function"` (OART, while a function is running), `"thinking"` (OART, otherwise), or `"double_turn"` (double-turn filler) |

#### Reasoning / inner-dialogue (content-only)

These three actions carry **no extra metadata object** — they only set `action` + a human-readable `content` string. Because they have no `metadata`, they appear in the blessed `call_log` and `raw_call_log` but are **not** emitted into `call_timeline` (`build_call_timeline` skips entries without metadata).

| action | Emitted from | `content` holds |
|--------|--------------|-----------------|
| `double_turn` | `double_turn.c` | The hidden "double-turn" directive the utility model produced for the next turn |
| `inner_dialog` | `ai_send_text.c`, `oart.c` | The model's inner-dialogue / scratchpad text (logged once per change, de-duplicated) |
| `inner_dialog_scorecard` | `ai_send_text.c` | Same as `inner_dialog`, used when `inner_dialog_scorecard` mode is on |

> Note on `assistant-thinking`: LLM reasoning output is recorded as a separate **`assistant-thinking`** role entry (not a system-log action), added via `ai_conversation_add_printf` in `mod_openai.c`. It carries only `role` / `content` / `timestamp` / `lang` / `tokens` (plus an internal top-level `turn_id`) and **no `metadata` object** — `ai_conversation_add_with_latency` builds the metadata block only for `user` / `assistant` / `assistant-manual` roles, not `assistant-thinking` — so it likewise never reaches `call_timeline`.

---

## Tool entries: function_name

Tool entries (`role: "tool"`) carry `function_name` in their metadata. In the blessed call_log, metadata is flattened to top level:

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "Order found",
  "timestamp": 1705300015890000,
  "function_name": "check_order",
  "latency": 200,
  "function_latency": 100,
  "execution_latency": 100,
  "start_timestamp": 1705300015690000,
  "end_timestamp": 1705300015890000
}
```

The function name is read directly from the tool entry — `toolEntry.function_name` — without matching against `swaig_log[]` by timestamp.

Note: `function_name` is on the **tool** entry (the result), not the **assistant** entry (which carries `tool_calls` with the call ID).

Each SWAIG call also writes an `assistant` entry with `tool_calls` (the request, `content: ""`) immediately **before** the `tool` entry (the result). Both share the same internal `turn_id`, and the `tool_call_id`/`id` ties the result to the request. The `tool_call_id`/`id` pairing is the consumer-facing correlation key — `turn_id` is an internal grouping field that is not serialized onto these entries (see [Turn identity](#turn-identity-turn_id--user_turn_id)).

### Full tool-entry metadata fields

All fields below are in the tool entry's `metadata` (flattened to top level in blessed output). Source: `ai_conversation_execute_function` in `conversation.c`.

| Field | Type | Description |
|-------|------|-------------|
| `function_name` | string | The function/tool name (the direct-identity field — use instead of matching `swaig_log[]`) |
| `latency` | number | ms, the surrounding turn's LLM time-to-first-token. Present only when the turn had a measured LLM latency triple |
| `utterance_latency` | number | **Deprecated** in tool calls. Carries the surrounding turn's `utterance_latency` value. Present only when measured |
| `function_latency` | number | The canonical name for `utterance_latency` on a tool entry — set to the same value (the surrounding turn's `utterance_latency`). Present only when measured. *Not* recomputed from `start_timestamp`/`end_timestamp` |
| `audio_latency` | number | **Deprecated** in tool calls. Carries the surrounding turn's `audio_latency` value. Present only when measured |
| `execution_latency` | number | The canonical name for `audio_latency` on a tool entry — set to the same value (the surrounding turn's `audio_latency`). Present only when measured. *Not* recomputed from `start_timestamp`/`end_timestamp` |
| `deprecation_warning` | string | Always present, literal: `"fields utterance_latency, audio_latency deprecated in tool calls"` |
| `start_timestamp` | number | μs when function execution began (omitted when not supplied) |
| `end_timestamp` | number | μs when the result was recorded (always present) |
| `distilled` | boolean | `true` when the result was distilled (TOOL_RESULT_DISTILL) — `content` holds the concise version the model saw; present only when distillation ran |
| `original_result` | string | The full pre-distillation result text, for telemetry. Present only when `distilled` is true. Flows to the call log but never to the model |

> The latency fields on a tool entry carry the surrounding LLM turn's latency triple, **not** the function's own execution time. The triple (`latency`/`utterance_latency`/`audio_latency`, plus the `function_latency`/`execution_latency` aliases) is attached only when all three were non-zero at call time; otherwise none of them appear. For the function's actual execution time use `end_timestamp − start_timestamp`. `deprecation_warning` and `end_timestamp` are the latency-area fields that are *always* present.

---

## User and assistant entries

Metadata is flattened to top level in blessed output. Both entry kinds are built in `ai_conversation_add_with_latency` (`conversation.c`).

**User entry metadata fields:**

| Field | Type | Description |
|-------|------|-------------|
| `confidence` | number | ASR confidence, **0.0–1.0 float** (e.g. `0.98`), defaults to `1.0`. On merged turns it's the content-length-weighted average across segments |
| `content_type` | string | `"Detected Speech"` or `"DTMF"` |
| `speaker` | string | Diarization speaker label. Present only when a speaker was identified |
| `start_timestamp` | number | μs, speech onset (`begin_speaking_time`). Present only when the turn has VAD timing |
| `end_timestamp` | number | μs, final ASR result received (`last_detect_time`) |
| `speaking_to_final_event` | number | ms, `start_timestamp` → `end_timestamp` |
| `speaking_to_turn_detection` | number | ms, speech start → turn-detection. Present only when mod_deepgram supplied `request_finalize_time` |
| `turn_detection_to_final_event` | number | ms, turn-detection → final. Same presence condition |
| `barge_count` | number | Times the user interrupted before this turn. In OART mode it's stamped on the user entry whenever there was at least one barge. In text mode it appears only on a **merged** entry (the count of merged segments, plus any carried from the first segment) — an unmerged text-mode user entry has no `barge_count` |
| `merged` | boolean | `true` when this entry was consolidated from multiple barge-in segments (only present on merged entries) |
| `merge_count` | number | Number of segments merged (only present on merged entries) |
| `entity` / `eot` / `timing` | object | mod_deepgram ASR-telemetry blocks (see below). Present only when the engine enriched the final |

User entries are stamped internally with `turn_id` and `user_turn_id`, but these are not serialized onto the entry in `call_log` / `raw_call_log` (see [Turn identity](#turn-identity-turn_id--user_turn_id)).

**Assistant entry metadata fields:** `latency`, `utterance_latency`, `audio_latency` (always present, `0` sentinel when no acoustic origin), plus `acoustic_latency`, `eos_to_push_latency`, `dg_decision_latency`, `poll` (always present, JSON `null` when no anchor), the raw `*_wall_us` stamps, and the `stamps_us` object. On a barged response the entry also gets the barge fields, but only on `raw_array` (so they reach `raw_call_log` / `call_timeline`, not the blessed `call_log`). All detailed in the sections below.

### User entry ASR telemetry

When mod_deepgram delivers turn telemetry on a speech final, three nested blocks ride along on the user entry's metadata (and flatten to top level in blessed output / `call_timeline` like every other metadata field). They are **absent** on DTMF, on injected/system-sourced user turns, and on finals the engine didn't enrich — so test for presence before reading.

**`entity`** — the validated structured shape the turn resolved to. Present **only when a complete entity is recognized** (so `entity` present ⇒ you have validated structured data; absent ⇒ text only).

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `phone` · `email` · `ssn` · `card` · `uuid` · `url` · `money` · `time` · `date` · `ordinal` |
| `value` | string | The **canonical** form — libphonenumber E.164 for a phone, the assembled `local@domain.tld` for an email, the formatted value otherwise. Read this back, not the raw ASR text. |
| `valid` | boolean | `true` once it passed validation (phone via libphonenumber, ssn ranges, card Luhn). A phone-shaped run that fails validation is `false`. |

**`eot`** — how the turn ended (makes "latency = f(turn-end confidence)" observable).

| Field | Type | Description |
|-------|------|-------------|
| `basis` | string | `entity_snap` (released on the short settle — high confidence) · `growth_stop` (waited out the growth-stall) · `ceiling` (force-released at the hold cap — **low confidence, consider re-prompting**) · `natural` (a normal un-held turn) |
| `confidence` | number | Acoustic Smart-Turn end-of-turn probability at commit (0–1) |

**`timing`** — observability for tuning the hold/commit.

| Field | Type | Description |
|-------|------|-------------|
| `hold_ms` | number | How long the dictation hold kept the turn open (0 for an un-held turn) |
| `commit_latency_ms` | number | Last-token → commit (the stall window that elapsed). The authoritative "how long EOT held this turn"; prefer it over inferring hold from the wall stamps |
| `segments` | number | How many engine finals fused into the turn (1 = clean single turn; >1 = a held multi-segment dictation) |
| `walkbacks` | number | How many times an end-of-turn was speculatively decided then retracted ("user kept talking") before the committing EOT. 0 = committed first try; high = the EOT logic churned (e.g. a long number read in spurts). Distinct from `segments` (engine finals) and `hold_ms` (duration) — this is *decision* churn |

**Example user entry (blessed, metadata flattened):**

```json
{
  "role": "user",
  "content": "415-555-0192",
  "confidence": 0.98,
  "content_type": "Detected Speech",
  "start_timestamp": 1705300002000000,
  "end_timestamp": 1705300003789000,
  "entity": { "type": "phone", "value": "+14155550192", "valid": true },
  "eot":    { "basis": "entity_snap", "confidence": 0.967 },
  "timing": { "hold_ms": 308, "commit_latency_ms": 308, "segments": 2 }
}
```


### Latency fields on assistant entries

The pre-computed latency fields are in **milliseconds**. They measure different intervals; which one to trust depends on what you're comparing against. The raw wall-clock μs timestamps below the table are exposed so consumers can compute custom derivations.

| Field | Start point | End point | When to use |
|-------|-------------|-----------|-------------|
| `latency` | Text: start of user turn at LLM-send time (`request_detect_time` = ASR final) / OART: `response.created` | Text: first response token / OART: `response.output_item.added` | Measures model time-to-first-token; infrastructure-level LLM benchmarking |
| `utterance_latency` | Same as `latency` | Text: first completed utterance segment (phrase stop) / OART: first `response.audio.delta` received | TTS-ready latency; how long until something is ready to speak |
| `audio_latency` | Same as `latency` | Text: first non-silence PCM frame written by output thread (`audio_response_time`) / OART: first `response.audio.delta` received | Server-side "first audio available" — still before codec/RTP pipeline |
| `acoustic_latency` | Text: end of user's last spoken word (from Deepgram word-level timestamps, anchored via `audio_anchor_wall_us` / `audio_anchor_stream_us`); falls back to last `detected-partial-speech` event if mod_deepgram didn't supply word-level fields / OART: `input_audio_buffer.speech_stopped` (server's end-of-turn decision) | Text: first non-silence PCM frame written (`audio_response_time`) / OART: first non-silence PCM frame written via `switch_core_session_write_frame` (`first_audio_write_time`) | Comparison against wav-based analyzers measuring acoustic-silence → first-audio-in-recording |
| `eos_to_push_latency` | End of user's last spoken word (from word-level timestamps) | mod_deepgram's `status_pushed_wall_us` — when the final result was deliverable | Isolates ASR / turn-detection / fusion overhead from the model+TTS pipeline that `audio_latency` rolls in. Text mode only; absent when word-level timing fields aren't provided |
| `dg_decision_latency` | mod_deepgram's `turn_decided_wall_us` — when the turn-end decision fired | mod_deepgram's `status_pushed_wall_us` | Pure mod_deepgram internal queue-push overhead. Useful for spotting implementation-side delays distinct from acoustic or fusion latency |
| `poll` | mod_deepgram's `status_pushed_wall_us` — final deliverable | `request_detect` — when this module read the final / sent to the model | mod_openai's final-read lag. A term of the `acoustic = eos_to_push + audio + poll` decomposition, exposed as its own field so it's alarmed on directly rather than inferred. Text mode only; `null` when no anchor |

**Start-point differences explained:**

- Text mode `audio_latency` uses `request_detect_time`, which is set to the moment the Deepgram **final** transcript event fires. Deepgram emits this after its VAD's silence-hang window closes (typically 200–500 ms after the user actually stopped making sound), so the start is later than acoustic silence.
- Text mode `acoustic_latency` uses the **end of the user's last spoken word** as its anchor, computed from `audio_anchor_wall_us + (last_word_end_stream_us - audio_anchor_stream_us)` against mod_deepgram's word-level timestamps. This is grounded directly in the audio waveform rather than the partial-delivery cadence, so it's more precise than `last_partial_time`. When those word-level fields aren't supplied (older mod_deepgram, or engines that don't emit them), it falls back to `last_partial_time` — the timestamp of the most recent **partial** transcript event, which fires close to (but not exactly at) acoustic silence.
- OART mode `audio_latency` measures only the model generation window (`response.created` → first audio delta). `response.created` fires after the server has decided the user's turn is over — with `server_vad` this tracks Deepgram-style behavior, with `semantic_vad` it can fire predictively while the user is still trailing off.
- OART mode `acoustic_latency` starts at `user_speech_end_time` (the server's `input_audio_buffer.speech_stopped` timestamp) and ends at `first_audio_write_time` (when the first real PCM frame is actually written to FreeSWITCH's write pipeline). This absorbs the entire model round-trip and also the buffering between "delta received" and "frame written."

**End-point differences explained:**

- Text and OART `audio_latency` mark the server-side "first audio byte available" event — for OART this is the first `response.audio.delta` received from the WebSocket; for text it's the first non-silence frame handed to the output thread. In both cases, there is still frame-buffer, codec, and RTP work to happen before the caller actually hears audio.
- `acoustic_latency`'s end point is the first real PCM frame the write loop hands off via `switch_core_session_write_frame`. This is what an external wav analyzer sees as "bot audio starts here" (modulo one codec frame / ~20 ms of RTP scheduling).

**Expected numeric relationship** between the metrics for the same turn: `latency ≤ utterance_latency ≤ audio_latency ≤ acoustic_latency`. `acoustic_latency` is the only one anchored at the user's actual end of speech (last word's audio energy ending, or last partial as fallback), while the other three anchor at `request_detect_time` (Deepgram final delivery), which fires *after* the silence-hang has closed. Earlier start + same end ⇒ a larger interval, so `acoustic_latency` is typically the largest of the four — matching what a wav-based analyzer would measure end-to-end (e.g. the spec-verified case where `audio_latency=561 ms`, `acoustic_latency=1088 ms`, wav-measured=1050 ms). For OART mode the same ordering holds: `acoustic_latency` starts at `input_audio_buffer.speech_stopped` (similar to text's anchor) but ends at write-frame rather than delta-received, so it stays the largest.

If you are comparing against a wav-based acoustic analyzer (measuring from the last sample of user audio in the recording to the first sample of assistant audio in the recording), use `acoustic_latency`. If you are measuring server-side model latency alone, use `audio_latency`.

**`null` vs positive value:** `acoustic_latency`, `eos_to_push_latency`, and `dg_decision_latency` are always present in the schema on assistant entries. A positive number is a measured value; JSON `null` means the metric is not derivable for this turn. The null cases are:

- **Greeting / timeout / end-of-call summary:** no preceding user turn → no acoustic anchor.
- **`assistant-manual` entries** (queued `ais_say` fillers like "Querying the knowledge base"): these don't go through the LLM round-trip. `latency` / `utterance_latency` / `audio_latency` are still emitted, but as the `0` sentinel (these three are always present on assistant entries — `0` means "no acoustic origin"). The derived metrics `acoustic_latency` / `eos_to_push_latency` / `dg_decision_latency` / `poll` are forced to `null` for manual entries (they'd otherwise inherit the surrounding response's values). The four model `stamps_us` keys (`request_detect` / `first_token` / `first_utterance` / `first_audio`) are omitted. **Exception:** a filler *does* produce real audio the caller hears, so its entry is later back-filled with its own `stamps_us.first_audio` (the filler's onset, stamped when the output thread plays it) and a real `acoustic_latency` (= filler `first_audio − last_word_end`), replacing the `null`. See [filler stamping](#filler-first-audio-vs-response-first-audio).
- **Bad/absent end-of-speech anchor:** when mod_deepgram omits `last_word_end_wall_us` (bad anchor) and the `status_pushed_wall_us − timing.commit_latency_ms` reconstruction isn't available either, `acoustic_latency` and `eos_to_push_latency` are emitted `null` rather than computed against a missing stamp (`dg_decision_latency` is unaffected — it uses `turn_decided_wall_us`, present on every committed final).

Consumers should treat `null` as "not measured," distinct from `0` (which would only ever appear if the bot somehow produced audio at the same μs as the user's last word — never in practice).

The three raw `*_wall_us` fields follow the same anchor convention: present (a wall-clock μs value) when this turn responds to a user utterance, omitted on turns with no anchor.

### Raw wall-clock timestamps for custom derivations

Wall-clock μs timestamps exposed on the assistant entry alongside the pre-computed latencies. Use these when you need a measurement the pre-computed fields don't cover (e.g. subtracting from any other wall-clock event in your stack). They come from mod_deepgram's final result JSON; absent in OART mode, on turns with no preceding user-speech anchor, or when mod_deepgram didn't supply them. The four turn stamps are **monotonic** and decompose the turn — `speech_start_wall_us` (speaking) → `last_word_end_wall_us` (hold) → `turn_decided_wall_us` (deliver) → `status_pushed_wall_us`.

The values are snapshotted at the end of the most recent accepted user final and persist through the entire response cycle (LLM call, tool calls, reasoning, manual_says) — so they reflect the user turn the response is answering, not whatever live ASR state was when the audio thread happened to write a frame. Any subsequent user partials/finals only replace the snapshot after the *next* accepted user final.

| Field | Meaning |
|-------|---------|
| `speech_start_wall_us` | Wall-clock μs of speech onset for the turn (mod_deepgram's `StartOfSpeech`). The lower bound for the `last_word_end_wall_us` sanity guard, and lets you decompose turn latency entirely from mod_deepgram's clock. |
| `last_word_end_wall_us` | Wall-clock μs when the **committed** turn's last spoken word ended — mod_deepgram's emitted value, the MAX word-end across **all** fused segments of a held multi-segment turn (not just the first segment, so `acoustic_latency` / `eos_to_push_latency` reflect the true end of speech rather than the full dictation span). **May be absent**: mod_deepgram omits it when the mapped time would precede speech onset (bad anchor); mod_openai then reconstructs end-of-speech from `status_pushed_wall_us − timing.commit_latency_ms`, and if even that is unavailable omits the dependent `acoustic_latency` / `eos_to_push_latency` rather than emit a bogus value. The most precise "user stopped talking" anchor available. |
| `turn_decided_wall_us` | Wall-clock μs of the turn-end decision that **committed** — the `EOT_RELEASE` on a held turn, else the fusion fire / Deepgram-natural `speech_final` / libfvad `STOP_TALKING`. Anchored on the committing decision, not the first *speculative* fire that gets walked back — so `dg_decision_latency` measures real release→push delivery (~10 ms), not the whole deliberation (which on held dictations spans tens of seconds). |
| `status_pushed_wall_us` | Wall-clock μs when `SignalWireRecognitionComplete` was pushed to the status queue (i.e. the moment the next `asr_check_results` poll would return SUCCESS). |

**Custom derivations:**

```
decision_to_push_us = status_pushed_wall_us - turn_decided_wall_us   (mod_deepgram internal overhead)
eos_to_push_us      = status_pushed_wall_us - last_word_end_wall_us  (turn-detection + ASR overhead)
```

These two are also exposed as the pre-computed `dg_decision_latency` and `eos_to_push_latency` fields in milliseconds.

### Unified turn timeline (`stamps_us`)

Assistant entries also carry a single `stamps_us` object — every pipeline event as a raw wall-clock-μs stamp on the one `switch_time_now` clock (the same clock `record_call_start` uses). A renderer needs **zero anchor math**: every interval is `stamp_b − stamp_a`, and recording alignment is `stamp − record_call_start`. The caller stamps come from mod_deepgram, the four model stamps from mod_openai; all share the clock and are monotonic on a clean turn.

| key | event | owner |
|-----|-------|-------|
| `speech_start` | caller began speaking | mod_deepgram |
| `last_word_end` | caller's last word ended (= the wav human-stop anchor) | mod_deepgram |
| `suspected_end` | speculative end-of-turn (turn-decided instant); lands ~0.3–0.6 s after `last_word_end`. Present only when mod_deepgram supplied a suspected-end time. **Not** used to anchor `acoustic_latency` (that anchors on `last_word_end`) | mod_deepgram |
| `turn_decided` | end-of-turn committed | mod_deepgram |
| `status_pushed` | ASR result deliverable | mod_deepgram |
| `request_detect` | this module read the final / sent it to the model | mod_openai |
| `first_token` | model's first response token | mod_openai |
| `first_utterance` | first speakable segment | mod_openai |
| `first_audio` | first non-silence PCM frame written | mod_openai |

> `suspected_end` is a caller stamp emitted into `stamps_us` for observability only — no millisecond latency field is derived from it, and it has no flat `*_wall_us` twin (unlike the other four caller stamps). The four flat `*_wall_us` fields are `speech_start_wall_us`, `last_word_end_wall_us`, `turn_decided_wall_us`, `status_pushed_wall_us`.

Every latency is then a subtraction:

```
latency             = first_token − request_detect
utterance_latency   = first_utterance − request_detect
audio_latency       = first_audio − request_detect
eos_to_push_latency = status_pushed − last_word_end
dg_decision_latency = status_pushed − turn_decided
acoustic_latency    = first_audio − last_word_end       (the recorded silence — first_audio is the true PCM-write stamp)
poll                = request_detect − status_pushed    (the final-read lag, exposed as its own field)
```

Example object on an assistant entry:

```jsonc
"stamps_us": {
  "speech_start":    1781389930803000,
  "last_word_end":   1781389931223000,
  "turn_decided":    1781389931663000,
  "status_pushed":   1781389931814000,
  "request_detect":  1781389931834000,
  "first_token":     1781389932526000,
  "first_utterance": 1781389932573000,
  "first_audio":     1781389932723000
}
```

**Free cross-check:** `first_audio − last_word_end` should equal the recording's `ai_start − human_stop` within one codec frame — `last_word_end` is the wav human-stop anchor, on the record clock. A divergence indicates a real bug, visible directly on the timeline.

Keys are omitted when their stamp is unknown (no preceding user turn, OART mode, an engine that didn't supply it); the four model stamps are omitted on manual (non-LLM) assistant entries — **except** a filler's own `first_audio`, back-filled when the output thread plays it (below). `stamps_us` is additive: the flat `*_wall_us` stamps and the millisecond `latency` / `acoustic_latency` / `eos_to_push_latency` / … fields are emitted alongside it, so a consumer can read either representation.

#### Filler first-audio vs response first-audio

When the agent plays a filler ("Let me look that up…") before a tool-backed answer, the **filler** is the caller's first agent audio — the recording catches it well before the generated answer. Two separate entries each carry their own onset, so the timeline shows both:

| entry | `stamps_us.first_audio` | `acoustic_latency` |
|-------|-------------------------|--------------------|
| the **filler** (`assistant-manual`) | when the filler audio started | filler `first_audio − last_word_end` — the **true** caller-stop → first-agent-audio |
| the **response** (`assistant`) | when the generated answer's first PCM was written | response `first_audio − last_word_end` — caller-stop → answer (includes the filler + tool gap) |

So the exchange's true perceived latency is the **filler's** `acoustic_latency`; the response's is how long until the real answer. Reading the filler's onset (rather than the response's) is what keeps a tool-backed turn's measured onset from landing ~1.2–1.4 s late.

Caveat: the filler stamp is taken on the output thread as the filler begins playing (synthesis start). For the short cached fillers used here that's within a few frames of the first PCM; it is not the exact PCM-write instant the response's `first_audio` is (the manual playback path is a blocking `switch_ivr_speak_text_handle`, with no first-frame hook). OART-mode fillers go through a different path and are not stamped here.

### Stacking the latencies (full-pipeline view)

The `latency` / `utterance_latency` / `audio_latency` fields are anchored at `request_detect_time` — the moment FreeSWITCH receives the Deepgram final event. That's *after* the user actually stopped talking, so stacking only those three covers just the **model + TTS + write** portion of the pipeline.

`acoustic_latency` and `eos_to_push_latency` are anchored at `last_word_end_wall_us` — the moment user audio energy ended — surfacing the **turn-detection** portion of latency.

#### Timeline

```
                                  ASR poll
                                  delay (~20ms,
                                  not exposed)
                                       │
[user stopped]    [final pushed]   [FS reads it]              [bot audio plays]
     │                  │                │                            │
     ▼                  ▼                ▼                            ▼
     ├ eos_to_push  ───┤
                       │
                                        │
                                        ├ latency ──────────────┤
                                        ├ utterance_latency ─────────┤
                                        ├ audio_latency ───────────────┤
     │
     ├ acoustic_latency ──────────────────────────────────────────────┤
```

#### Identity

```
acoustic_latency = first_audio − last_word_end
```

This **is** the recorded silence the caller hears — `first_audio` is stamped inline at the first PCM-frame write (not on a poll/batch tick), so there is nothing to correct. The algebraic decomposition `acoustic_latency = eos_to_push_latency + audio_latency + poll` holds and every term is an emitted field, but `poll` (`request_detect − status_pushed`, the final-read lag) is a standalone field — **do not** subtract it from `acoustic_latency`. Cross-check: `first_audio − last_word_end` must equal the recording's `ai_start − human_stop` within one codec frame.

#### Latency bar-segment breakdown

A consumer building a stacked-bar visualization anchored at "user-stopped-talking" decomposes the full timeline like this:

| Bar segment | Field |
|---|---|
| Turn detection (user-stopped → final deliverable) | `eos_to_push_latency` |
| └─ of which mod_deepgram internal (decision → publish) | `dg_decision_latency` |
| ASR check poll delay | `poll` |
| Model time-to-first-token | `latency` |
| Model → utterance ready | `utterance_latency - latency` |
| Utterance → audio frame | `audio_latency - utterance_latency` |
| **Total user-perceived** | `acoustic_latency` |

`latency` / `utterance_latency` / `audio_latency` share the same start point (`request_detect_time`), so a dashboard that stacks those three covers model-plus-delivery time. Add `eos_to_push_latency` as the bottom-most bar (plus the small poll delay) for the turn-detection segment, or use `acoustic_latency` as the full-extent reference and break it down per the table above.

### Assistant barge-in metadata

When an assistant response is interrupted by the user (normal barge, not transparent barge), the last `assistant` entry gets additional metadata fields. **These are written onto `raw_array` only** (`mod_openai.c` text mode / `oart.c` OART mode), so they surface in `raw_call_log` and `call_timeline` but **not** in the blessed `call_log` (which is built from the filtered `array`).

| Field | Type | Description |
|-------|------|-------------|
| `barged` | boolean | `true` — response was interrupted by user |
| `barge_elapsed_ms` | number | Milliseconds of audio that played before barge |
| `text_heard_approx` | string | Approximate text heard before barge (substring to word boundary) |
| `text_spoken_total` | string | Full SWAIG-stripped text that would have been spoken |

`text_heard_approx` is estimated from `barge_elapsed_ms` and a self-calibrating TTS speaking rate (seeded at ~15 chars/sec, updated from each completed non-barged response in the session). Consumers who want different estimation can use `barge_elapsed_ms` and `text_spoken_total` directly.

In OART mode `text_spoken_total` is stamped when the response audio is produced, then `barged` / `barge_elapsed_ms` / `text_heard_approx` are filled in if the response is later interrupted.

These fields auto-flatten into `call_timeline` `ai_response` events via `build_call_timeline`.

### Turn identity (`turn_id` / `user_turn_id`)

Internally, every conversation entry that belongs to a turn is stamped with a top-level `turn_id` (the session's monotonic `turn_idx` at the time the entry was added). All entries produced while answering one user turn — the `assistant` entry, its `tool_calls` request, the `tool` result, `assistant-thinking`, and the system-log markers — share that turn's `turn_id`. It is the reliable key for grouping a turn's entries together, and it drives sliding-window eviction and transparent-barge removal. User entries additionally carry `user_turn_id` (the monotonic count of user turns, `user_idx`). On a merged/consolidated user entry both IDs are updated to the **newest** segment's value so the sliding window sees the correct age. `turn_id` is **omitted** on `system-pvt` entries (persistent directives that must survive eviction) and on entries added before the first turn.

**Visibility in the emitted payload:** `turn_id` / `user_turn_id` are stamped as top-level fields on the live entry, not inside `metadata`. The serializer that builds `call_log` / `raw_call_log` (`ai_conversation_json`) rebuilds each user / assistant / tool entry from `role` + `timestamp` + `tool_calls` + flattened `metadata` + `content` only, so it **drops** these top-level IDs — they do not appear on user/assistant/tool entries in either log. **System-log entries are the exception:** they pass through verbatim, so any `turn_id` stamped on a system-log entry is visible. `build_call_timeline` likewise copies only `ts` + flattened `metadata`, so `turn_id` / `user_turn_id` do **not** appear on `call_timeline` events either. Treat them as internal grouping/eviction keys, not as a consumer-facing correlation field on the conversation entries.

**Example:**

```json
{
  "role": "assistant",
  "content": "Thank you for calling. I can help you with your order. Let me look that up for you.",
  "metadata": {
    "latency": 500,
    "utterance_latency": 450,
    "audio_latency": 480,
    "acoustic_latency": 720,
    "eos_to_push_latency": 95,
    "dg_decision_latency": 12,
    "poll": 145,
    "speech_start_wall_us": 1705300003900000,
    "last_word_end_wall_us": 1705300004380000,
    "turn_decided_wall_us": 1705300004463000,
    "status_pushed_wall_us": 1705300004475000,
    "barged": true,
    "barge_elapsed_ms": 3200,
    "text_heard_approx": "Thank you for calling. I can help you with your",
    "text_spoken_total": "Thank you for calling. I can help you with your order. Let me look that up for you."
  }
}
```

---

## call_timeline (optional)

The `call_timeline` array sits at the top level of the post_data payload, alongside `call_log`, `raw_call_log`, `swaig_log`, `times[]`, etc. It is present only when there are entries with metadata.

> **`call_log` vs `raw_call_log`:** the post_data carries both. `call_log` is built from the filtered `array` (`ai_conversation_json(raw=FALSE)`) — sliding-window-evicted, consolidated, step-hidden entries removed. `raw_call_log` is built from `raw_array` (`raw=TRUE`) — the unfiltered append-only record. **`build_call_timeline` reads `raw_array`**, so `call_timeline` is aligned with `raw_call_log`, not the blessed `call_log`. This is why barge metadata (written only to `raw_array`) appears in `call_timeline` but not in `call_log`.

It's a flat event stream built from `raw_array` (the same source as `raw_call_log`). Each event has:

- `ts` — timestamp (microseconds, same as call_log timestamps)
- `type` — event type string
- All metadata fields flattened to top level

### Type mapping

| call_log role | type value |
|---------------|------------|
| system-log | Value of `action` field (e.g. `"step_change"`, `"function_call"`) |
| user | `"user_input"` |
| assistant / assistant-manual | `"ai_response"` |
| tool | `"tool_result"` |

Entries without a `metadata` object are skipped. That covers system prompts and pvt entries, the `assistant-thinking` role, **and** the flat-key system-log actions (`function_error`, `function_loop`, `swaig_problem`, `change_step_failed`, `double_turn`, `inner_dialog`, `inner_dialog_scorecard`) — those carry their fields as flat top-level keys with no `metadata`, so they show up in `call_log` / `raw_call_log` but not here.

### Synthetic events

Beyond the role-mapped events above, `build_call_timeline` emits two **synthetic** events derived from entry fields (no system-log entry of their own exists for these):

| type | Emitted from | Fields |
|------|--------------|--------|
| `text_normalize` | A user entry whose `original` differs from `content` (ITN ran on ASR input) | `direction: "itn"`, `original`, `normalized` |
| `pronounce` | An assistant entry whose `pronounced` differs from `content` (pronounce rules / TN ran on TTS output) | `original`, `result` |

### Example

```json
{
  "call_timeline": [
    {"ts": 1705300001123000, "type": "session_start", "context": "default", "step": "greeting", "model": "gpt-4o"},
    {"ts": 1705300001456000, "type": "ai_response", "latency": 450, "utterance_latency": 200, "audio_latency": 250},
    {"ts": 1705300003789000, "type": "user_input", "confidence": 0.955, "start_timestamp": 1705300002000000, "end_timestamp": 1705300003789000, "entity": {"type": "phone", "value": "+14155550192", "valid": true}, "eot": {"basis": "entity_snap", "confidence": 0.967}},
    {"ts": 1705300005012000, "type": "step_change", "context": "default", "from_step": "greeting", "to_step": "collect_info", "trigger": "ai_function"},
    {"ts": 1705300010000000, "type": "gather_start", "output_key": "profile", "total_questions": 3},
    {"ts": 1705300010100000, "type": "gather_question", "key": "first_name", "question_index": 0, "question_type": "string", "requires_confirm": false},
    {"ts": 1705300012000000, "type": "gather_answer", "key": "first_name", "question_index": 0, "attempt": 0, "confirmed": false},
    {"ts": 1705300015890000, "type": "function_call", "context": "default", "step": "lookup", "function": "check_order", "native": false, "duration_ms": 234},
    {"ts": 1705300016000000, "type": "tool_result", "function_name": "check_order", "latency": 234, "execution_latency": 200},
    {"ts": 1705300025456000, "type": "session_end", "reason": "hangup", "ended_by": "caller"}
  ]
}
```

You can use `call_timeline` instead of walking call_log yourself if you just need a flat event stream. All the same data is on the call_log entries.

---

## Companion arrays

The `call_log` is self-sufficient for classifying events, but two sibling arrays in the payload carry detail the `call_log` does not.

### `swaig_log[]`

Holds the full record of each function call, beyond the summary on the `function_call` system-log event. One entry is appended per call (built in `execute_user_function`, `actions.c`). `check_for_input` calls are excluded. Per-entry fields:

- `command_name` — function name.
- `command_arg` — the full argument string (the `function_call` system-log event carries only a summary).
- `epoch_time` — wall-clock epoch seconds when the call started.
- `native` — `true` for internal functions (present only then).
- `active_count` — the function's remaining active-uses count, or `"endless"`.
- `url` / `post_data` — for webhook functions, the endpoint and the full POST body sent.
- `post_response` — the parsed webhook response (the `response` text plus any `action` array — i.e. what the webhook instructed the system to do after the call). `delayed_post_response` for the delayed-action variant.
- `mcp_url` / `mcp_tool` / `mcp_response` / `mcp_error` — for MCP-backed tools.

Function identity is on the `tool` entry's `function_name`, so matching `swaig_log[]` to `call_log[]` by timestamp is unnecessary.

### `times[]`

Holds per-generation performance metrics for each LLM round-trip. Each entry carries: `response` (the full response text, redacted when `redact_prompt` is on), `response_word_count`, `answer_time` (seconds, request-initiated → completion), `token_time` (seconds, first token → last token), `tokens` (output token count), `avg_tps` (tokens/sec over `answer_time`), and `tps` (tokens/sec over `token_time`).

**`times[]` is per-generation, not per-spoken-turn.** Every LLM round-trip writes an entry, including abandoned/regenerated responses (a barge-interrupted "Got it…" and the retry that replaced it both appear) and empty tool-call rounds (an LLM round that emits only a tool call carries no spoken text but still records timing). The blessed `call_log` collapses these into per-spoken-turn entries; `times[]` does not. **Match `times[]` entries to spoken turns by response text, not by index** — index N in `times[]` is generally not the Nth spoken assistant entry.
