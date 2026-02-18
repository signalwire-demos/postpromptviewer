import { epochToDate } from './utils.js';

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
  };
}

/**
 * Enrich call_log assistant entries with barge fields from raw_call_log
 * or call_timeline. The processed call_log strips these fields, so we
 * merge them back by matching on timestamp.
 */
function _enrichCallLog(callLog, rawCallLog, callTimeline) {
  // Build lookup: timestamp → barge data from raw_call_log
  const bargeByTs = new Map();
  const BARGE_FIELDS = ['barged', 'barge_elapsed_ms', 'text_heard_approx', 'text_spoken_total'];

  for (const entry of rawCallLog) {
    if (entry.role !== 'assistant' || !entry.barged) continue;
    const ts = entry.timestamp || entry.start_timestamp;
    if (!ts) continue;
    const data = {};
    for (const f of BARGE_FIELDS) {
      if (entry[f] != null) data[f] = entry[f];
    }
    if (Object.keys(data).length) bargeByTs.set(ts, data);
  }

  // Fallback: pull from call_timeline ai_response entries
  if (bargeByTs.size === 0 && Array.isArray(callTimeline)) {
    for (const entry of callTimeline) {
      if (entry.type !== 'ai_response' || !entry.barged) continue;
      const ts = entry.ts;
      if (!ts) continue;
      const data = {};
      for (const f of BARGE_FIELDS) {
        if (entry[f] != null) data[f] = entry[f];
      }
      if (Object.keys(data).length) bargeByTs.set(ts, data);
    }
  }

  if (bargeByTs.size === 0) return callLog;

  // Merge barge data onto call_log entries
  return callLog.map(entry => {
    if (entry.role !== 'assistant') return entry;
    const ts = entry.timestamp || entry.start_timestamp;
    const barge = bargeByTs.get(ts);
    if (!barge) return entry;
    return { ...entry, ...barge };
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
      return entry.metadata?.ended_by || 'unknown';
    }
  }
  return 'unknown';
}
