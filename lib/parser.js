import { epochToDate, fieldsOf, stripText } from './utils.js';

const REQUIRED_FIELDS = ['call_id', 'action', 'call_start_date', 'call_log'];

/**
 * Validate and normalize a raw post-conversation JSON payload.
 * Timestamps are microsecond-precision Unix epoch integers.
 */
export function parsePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Payload must be a non-null object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in raw)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (raw.action !== 'post_conversation') {
    throw new Error(`Unexpected action: ${raw.action} (expected "post_conversation")`);
  }

  // When call_end_date is 0, fall back to session_end timestamp from call_log
  const callEndDate = raw.call_end_date || _inferCallEndDate(raw);

  return {
    // Identity
    callId: raw.call_id,
    projectId: raw.project_id || null,
    spaceId: raw.space_id || null,
    aiSessionId: raw.ai_session_id || null,
    aiIdTag: raw.ai_id_tag || null,
    conversationId: raw.conversation_id || null,
    appName: raw.app_name || null,

    // Timestamps (keep as microseconds for metric computation)
    callStartDate: raw.call_start_date,
    callAnswerDate: raw.call_answer_date || 0,
    aiStartDate: raw.ai_start_date || 0,
    aiEndDate: raw.ai_end_date || 0,
    callEndDate,

    // Parsed dates for display
    callStartTime: epochToDate(raw.call_start_date),
    callAnswerTime: epochToDate(raw.call_answer_date),
    aiStartTime: epochToDate(raw.ai_start_date),
    aiEndTime: epochToDate(raw.ai_end_date),
    callEndTime: callEndDate ? epochToDate(callEndDate) : null,

    // Caller info
    callerIdName: raw.caller_id_name || '',
    callerIdNumber: raw.caller_id_number || '',
    conversationType: raw.conversation_type || 'unknown',

    // Call metadata
    swmlCall: raw.SWMLCall || {},
    swmlVars: raw.SWMLVars || {},

    // Logs
    callLog: _enrichCallLog(raw.call_log || [], raw.raw_call_log || [], raw.call_timeline || []),
    rawCallLog: raw.raw_call_log || [],
    swaigLog: raw.swaig_log || [],
    callTimeline: raw.call_timeline || null,

    // Performance
    times: raw.times || [],

    // Token usage (conditional)
    totalInputTokens: raw.total_input_tokens ?? null,
    totalOutputTokens: raw.total_output_tokens ?? null,
    totalWireInputTokens: raw.total_wire_input_tokens ?? null,
    totalWireOutputTokens: raw.total_wire_output_tokens ?? null,

    // Media usage (conditional)
    totalTtsChars: raw.total_tts_chars ?? null,
    totalAsrMinutes: raw.total_asr_minutes ?? null,
    totalMinutes: raw.total_minutes ?? null,

    // Global data
    globalData: raw.global_data || {},

    // Post-prompt
    postPromptData: raw.post_prompt_data || { raw: '', substituted: '', parsed: [] },

    // Termination
    contentDisposition: raw.content_disposition || '',
    callEndedBy: _inferCallEndedBy(raw),
    sessionEndReason: _inferSessionEndReason(raw),
    hardTimeout: raw.hard_timeout || false,

    // Additional top-level
    conversationSummary: raw.conversation_summary || null,
    previousContexts: raw.previous_contexts || [],
    promptVars: raw.prompt_vars || {},
    params: raw.params || {},

    // Media usage per-minute/cost fields
    totalTtsCharsPerMin: raw.total_tts_chars_per_min ?? null,
    totalAsrCostFactor: raw.total_asr_cost_factor ?? null,

    // Token billing per-minute rates
    totalWireInputTokensPerMinute: raw.total_wire_input_tokens_per_minute ?? null,
    totalWireOutputTokensPerMinute: raw.total_wire_output_tokens_per_minute ?? null,

    // Recording
    recordCallUrl: (raw.SWMLVars && raw.SWMLVars.record_call_url) || null,
    recordCallResult: (raw.SWMLVars && raw.SWMLVars.record_call_result) || null,
    recordCallStart: (raw.SWMLVars && raw.SWMLVars.record_call_start) ? Number(raw.SWMLVars.record_call_start) : 0,
    // First-PCM-frame wall clock — the precise recording anchor, on the same
    // clock as stamps_us (record_call_start is the relay ack, ~100ms early)
    recordFirstFrame: (raw.SWMLVars && raw.SWMLVars.record_first_frame) ? Number(raw.SWMLVars.record_first_frame) : 0,
  };
}

/**
 * Enrich call_log assistant entries with barge fields from raw_call_log
 * or call_timeline, and infer start/end timestamps for user utterances
 * that were logged without them.
 */
function _enrichCallLog(callLog, rawCallLog, callTimeline) {
  const BARGE_FIELDS = ['barged', 'barge_elapsed_ms', 'text_heard_approx', 'text_spoken_total'];

  // Barge metadata is written to raw_array only, so it appears in
  // raw_call_log / call_timeline but never on the blessed call_log.
  // Join it back by spoken text (timestamps can differ between the raw
  // and blessed copies of the same response); ts kept as a fallback key.
  const bargeByText = new Map();
  const bargeByTs = new Map();

  const collect = (entry, ts) => {
    if (!entry.barged) return;
    const data = {};
    for (const f of BARGE_FIELDS) {
      if (entry[f] != null) data[f] = entry[f];
    }
    if (!Object.keys(data).length) return;
    for (const key of [entry.text_spoken_total, entry.content, entry.text_heard_approx]) {
      const text = stripText(key);
      if (text && !bargeByText.has(text)) bargeByText.set(text, []);
      if (text) bargeByText.get(text).push(data);
    }
    if (ts && !bargeByTs.has(ts)) bargeByTs.set(ts, data);
  };

  for (const entry of rawCallLog) {
    if (entry.role !== 'assistant') continue;
    collect(entry, entry.timestamp || entry.start_timestamp);
  }
  if (bargeByTs.size === 0 && bargeByText.size === 0 && Array.isArray(callTimeline)) {
    for (const entry of callTimeline) {
      if (entry.type !== 'ai_response') continue;
      collect(entry, entry.ts);
    }
  }

  const merged = callLog.map(entry => {
    if (entry.role !== 'assistant' || entry.barged != null) return entry;
    const queue = bargeByText.get(stripText(entry.content));
    const barge = (queue && queue.length ? queue.shift() : null) ||
      bargeByTs.get(entry.timestamp || entry.start_timestamp);
    if (!barge) return entry;
    return { ...entry, ...barge };
  });

  return _inferUserTimestamps(merged);
}

/**
 * Some ASR events land in call_log without start_timestamp / end_timestamp
 * (typically low-confidence partials or merge-artifact segments), which makes
 * them invisible on the Conversation Flow swimlane and the recording overlay.
 * When only the event-fire `timestamp` is present, anchor the end there and
 * estimate the start from the content length, clamped so the region doesn't
 * overrun the prior message's end.
 */
function _inferUserTimestamps(callLog) {
  const CHARS_PER_SEC = 16; // ~150 wpm at 5 chars/word + spaces
  const MIN_US = 1_000_000; // floor at 1s so regions remain visible
  const MAX_US = 30_000_000; // cap at 30s

  let prevEndUs = 0;
  return callLog.map(entry => {
    const hasWindow = entry.start_timestamp && entry.end_timestamp;
    if (hasWindow) {
      prevEndUs = Math.max(prevEndUs, entry.end_timestamp);
      return entry;
    }
    if (entry.role !== 'user' || !entry.timestamp) return entry;

    const endUs = entry.timestamp;
    const content = typeof entry.content === 'string' ? entry.content : '';
    const estUs = Math.min(MAX_US, Math.max(MIN_US, (content.length / CHARS_PER_SEC) * 1_000_000));
    const earliest = prevEndUs ? prevEndUs + 200_000 : 0;
    const startUs = Math.max(earliest, endUs - estUs);
    prevEndUs = endUs;

    return {
      ...entry,
      start_timestamp: startUs,
      end_timestamp: endUs,
      timings_inferred: true,
    };
  });
}

function _inferCallEndDate(raw) {
  const log = raw.call_log || [];
  for (const entry of log) {
    if (entry.role === 'system-log' && entry.action === 'session_end' && entry.timestamp) {
      return entry.timestamp;
    }
  }
  return 0;
}

function _inferCallEndedBy(raw) {
  if (raw.call_ended_by) return raw.call_ended_by;

  const log = raw.call_log || [];
  for (const entry of log) {
    if (entry.role === 'system-log' && entry.action === 'session_end') {
      return fieldsOf(entry).ended_by || 'unknown';
    }
  }
  return 'unknown';
}

/**
 * Why the AI loop ended: text mode "normal"/"hard_timeout"; OART "normal",
 * "hangup", "end_call", "inactivity_timeout", or "hard_stop".
 */
function _inferSessionEndReason(raw) {
  const log = raw.call_log || [];
  for (const entry of log) {
    if (entry.role === 'system-log' && entry.action === 'session_end') {
      return fieldsOf(entry).reason || null;
    }
  }
  return null;
}
