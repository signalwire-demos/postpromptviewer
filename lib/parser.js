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
    callEndDate: raw.call_end_date || 0, // 0 means still in progress

    // Parsed dates for display
    callStartTime: epochToDate(raw.call_start_date),
    callAnswerTime: epochToDate(raw.call_answer_date),
    aiStartTime: epochToDate(raw.ai_start_date),
    aiEndTime: epochToDate(raw.ai_end_date),
    callEndTime: raw.call_end_date ? epochToDate(raw.call_end_date) : null,

    // Caller info
    callerIdName: raw.caller_id_name || '',
    callerIdNumber: raw.caller_id_number || '',
    conversationType: raw.conversation_type || 'unknown',

    // Call metadata
    swmlCall: raw.SWMLCall || {},
    swmlVars: raw.SWMLVars || {},

    // Logs
    callLog: raw.call_log || [],
    rawCallLog: raw.raw_call_log || [],
    swaigLog: raw.swaig_log || [],

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
  };
}

function _inferCallEndedBy(raw) {
  // Check explicit field first
  if (raw.call_ended_by) return raw.call_ended_by;

  const log = raw.call_log || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.role === 'system' && typeof entry.content === 'string') {
      if (entry.content.includes('ended by the user')) return 'user';
      if (entry.content.includes('ended by the assistant')) return 'assistant';
    }
  }
  // Check swaig_log for hangup command
  const swaig = raw.swaig_log || [];
  for (const entry of swaig) {
    if (entry.command_name === 'hangup') return 'assistant';
  }
  return 'unknown';
}
