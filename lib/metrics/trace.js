import { mean, percentile, measuredMs, stampsOf, stripText } from '../utils.js';

/**
 * Group the blessed call_log into exchanges (caller turn → tools → AI reply)
 * and lay each reply's stamps_us milestones on one axis.
 *
 * The unified turn timeline means zero anchor math: every stage is
 * stamp_b − stamp_a on the same wall clock. On a filler-then-answer
 * exchange, the filler's first_audio is the caller's first agent audio —
 * the exchange's true mouth-to-ear latency — while the reply's first_audio
 * marks the real answer.
 */

// Pipeline milestones in causal order (filler_audio floats by timestamp)
const MILESTONE_ORDER = [
  'speech_start', 'last_word_end', 'turn_decided', 'status_pushed',
  'request_detect', 'first_token', 'first_utterance', 'first_audio',
];

export const MILESTONE_LABELS = {
  speech_start: 'speaking',
  last_word_end: 'last word',
  turn_decided: 'EOT',
  status_pushed: 'pushed',
  request_detect: 'read',
  first_token: 'token',
  first_utterance: 'utterance',
  first_audio: 'audio',
  filler_audio: 'filler',
};

// Stage category = what the pipeline was doing between two milestones,
// keyed by the milestone the stage ends at.
export const STAGE_CATEGORY = {
  last_word_end: 'speaking',
  turn_decided: 'turn-detect',
  status_pushed: 'turn-detect',
  request_detect: 'poll',
  first_token: 'llm',
  first_utterance: 'tts',
  first_audio: 'audio',
  filler_audio: 'filler',
};

function speedClass(ms) {
  if (ms == null) return 'none';
  if (ms < 1500) return 'fast';
  if (ms < 3000) return 'ok';
  return 'slow';
}

/**
 * Plain-English turn-taking verdict from the caller turn's eot/timing/entity.
 */
function verdictOf(user) {
  if (!user) return null;
  const eot = user.eot || null;
  const timing = user.timing || null;
  const entity = user.entity || null;
  if (!eot || !eot.basis) return null;

  const conf = eot.confidence != null ? Math.round(eot.confidence * 100) : null;
  switch (eot.basis) {
    case 'entity_snap':
      return {
        icon: '⚡', kind: 'snap',
        text: `Turn released on a complete ${entity?.type || 'entity'} — snap commit${conf != null ? ` at ${conf}%` : ''}`,
      };
    case 'growth_stop':
      return {
        icon: '✓', kind: 'held',
        text: `Dictation hold waited out the pause${timing?.segments > 1 ? ` (${timing.segments} segments fused)` : ''}${timing?.walkbacks ? `, ${timing.walkbacks} walkback${timing.walkbacks > 1 ? 's' : ''}` : ''}`,
      };
    case 'ceiling':
      return {
        icon: '⚠', kind: 'forced',
        text: 'Turn force-released at the hold cap — low confidence, consider re-prompting',
      };
    case 'natural':
      if (conf != null && conf < 60) {
        return { icon: '?', kind: 'uncertain', text: `Natural turn end but low confidence (${conf}%)` };
      }
      return { icon: '✓', kind: 'clean', text: `Clean natural turn end${conf != null ? ` (${conf}%)` : ''}` };
    default:
      return { icon: '·', kind: eot.basis, text: `Turn ended via ${eot.basis}` };
  }
}

export function buildTrace(data) {
  // AI turns that restate the post-call summary aren't part of the dialog
  const summaryTexts = new Set();
  if (typeof data.conversationSummary === 'string') {
    summaryTexts.add(stripText(data.conversationSummary));
  }
  const ppd = data.postPromptData || {};
  for (const v of [ppd.raw, ppd.substituted]) {
    if (typeof v === 'string' && v.trim()) summaryTexts.add(stripText(v));
  }

  // tool_call_id → the request (for args); swaig_log queue per name for detail
  const toolCallById = new Map();
  for (const msg of data.callLog) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.tool_calls)) continue;
    for (const tc of msg.tool_calls) {
      if (tc.id) toolCallById.set(tc.id, tc.function || {});
    }
  }
  const swaigByName = new Map();
  for (const entry of (data.swaigLog || [])) {
    const name = entry.command_name || 'unknown';
    if (!swaigByName.has(name)) swaigByName.set(name, []);
    swaigByName.get(name).push(entry);
  }

  // ── Group into exchanges ──
  const groups = [];
  let current = null;
  const startGroup = (user) => {
    current = { user, ai: [], tools: [] };
    groups.push(current);
  };

  for (const msg of data.callLog) {
    if (msg.role === 'user' && stripText(msg.content)) {
      startGroup(msg);
    } else if ((msg.role === 'assistant' || msg.role === 'assistant-manual') && stripText(msg.content)) {
      if (summaryTexts.has(stripText(msg.content))) continue;
      if (!current) startGroup(null); // greeting / pre-user audio
      current.ai.push(msg);
    } else if (msg.role === 'tool') {
      if (!current) startGroup(null);
      current.tools.push(msg);
    }
    // system / system-log / assistant-thinking / tool-call-only assistant
    // entries never perturb grouping
  }

  // ── Per-exchange view model ──
  const exchanges = groups.map((g, gi) => {
    const reply = [...g.ai].reverse().find(e => e.role === 'assistant') || g.ai[g.ai.length - 1] || null;

    // Milestones: the reply's stamps + each filler's own first_audio
    const stamps = reply ? stampsOf(reply) : {};
    const milestones = [];
    for (const key of MILESTONE_ORDER) {
      if (stamps[key] != null) milestones.push({ key, ts: stamps[key] });
    }
    for (const e of g.ai) {
      if (e.role !== 'assistant-manual') continue;
      const fs = stampsOf(e);
      if (fs.first_audio != null) milestones.push({ key: 'filler_audio', ts: fs.first_audio });
    }
    milestones.sort((a, b) => a.ts - b.ts);

    // Stages between consecutive milestones (<1ms gaps dropped)
    const span = milestones.length >= 2 ? milestones[milestones.length - 1].ts - milestones[0].ts : 0;
    const stages = [];
    for (let i = 1; i < milestones.length; i++) {
      const ms = (milestones[i].ts - milestones[i - 1].ts) / 1000;
      if (ms < 1) continue;
      stages.push({
        from: milestones[i - 1].key,
        to: milestones[i].key,
        ms: Math.round(ms),
        cat: STAGE_CATEGORY[milestones[i].key] || 'other',
        x: span ? ((milestones[i - 1].ts - milestones[0].ts) / span) * 100 : 0,
        w: span ? ((milestones[i].ts - milestones[i - 1].ts) / span) * 100 : 0,
      });
    }

    // Hero: caller-stop → first agent audio (filler counts — it's what the
    // caller heard). Fall back to the acoustic field, then audio latency.
    const lastWordEnd = stamps.last_word_end ?? null;
    const firstAgentAudio = milestones
      .filter(m => m.key === 'first_audio' || m.key === 'filler_audio')
      .map(m => m.ts)
      .sort((a, b) => a - b)[0] ?? null;

    let heroMs = null;
    let heroKind = null; // 'mouth-to-ear' | 'acoustic-field' | 'to-first-audio'
    if (lastWordEnd != null && firstAgentAudio != null) {
      heroMs = Math.round((firstAgentAudio - lastWordEnd) / 1000);
      heroKind = 'mouth-to-ear';
    } else {
      const acoustic = g.ai.map(e => measuredMs(e.acoustic_latency)).filter(v => v != null).sort((a, b) => a - b)[0] ?? null;
      if (acoustic != null) {
        heroMs = acoustic;
        heroKind = 'acoustic-field';
      } else if (reply) {
        heroMs = measuredMs(reply.audio_latency) ?? measuredMs(reply.utterance_latency) ?? measuredMs(reply.latency);
        heroKind = heroMs != null ? 'to-first-audio' : null;
      }
    }

    // Tools with args (tool_call_id) and swaig detail (per-name order)
    const tools = g.tools.map(t => {
      const name = t.function_name || 'unknown';
      const request = toolCallById.get(t.tool_call_id || t.id) || {};
      const queue = swaigByName.get(name);
      const swaig = queue && queue.length ? queue.shift() : null;
      return {
        name,
        args: request.arguments || swaig?.command_arg || null,
        result: typeof t.content === 'string' ? t.content : null,
        executionMs: (t.start_timestamp && t.end_timestamp)
          ? Math.round((t.end_timestamp - t.start_timestamp) / 1000) : null,
        distilled: !!t.distilled,
        url: swaig?.url || null,
        postResponse: swaig?.post_response ?? swaig?.delayed_post_response ?? null,
        native: !!swaig?.native,
      };
    });

    const user = g.user;
    return {
      index: gi,
      user: user ? {
        text: typeof user.content === 'string' ? user.content : '',
        confidence: user.confidence ?? null,
        entity: user.entity ?? null,
        eot: user.eot ?? null,
        timing: user.timing ?? null,
        contentType: user.content_type || null,
        timingsInferred: !!user.timings_inferred,
      } : null,
      replyText: reply && typeof reply.content === 'string' ? reply.content : '',
      fillers: g.ai.filter(e => e.role === 'assistant-manual').map(e => e.content || ''),
      barged: !!(reply && reply.barged),
      heroMs,
      heroKind,
      speed: speedClass(heroMs),
      verdict: verdictOf(user),
      milestones,
      stages,
      tools,
    };
  });

  // Roll-up over anchored (mouth-to-ear / acoustic) exchanges
  const heroVals = exchanges
    .filter(e => e.heroMs != null && e.heroKind !== 'to-first-audio')
    .map(e => e.heroMs);
  const stats = heroVals.length ? {
    avg: Math.round(mean(heroVals)),
    median: Math.round(percentile(heroVals, 50)),
    p95: Math.round(percentile(heroVals, 95)),
    max: Math.max(...heroVals),
    count: heroVals.length,
  } : null;

  return { exchanges, stats };
}
