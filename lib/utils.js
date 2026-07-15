/** Convert microsecond epoch to Date */
export function epochToDate(us) {
  if (!us || us === 0) return null;
  return new Date(us / 1000);
}

/** Convert microsecond epoch to milliseconds */
export function usToMs(us) {
  if (!us || us === 0) return 0;
  return us / 1000;
}

/** Convert microsecond duration to seconds */
export function usToSec(us) {
  return us / 1_000_000;
}

/** Safe division avoiding NaN/Infinity */
export function safeDivide(numerator, denominator, fallback = 0) {
  if (!denominator || !isFinite(numerator)) return fallback;
  return numerator / denominator;
}

/** Calculate mean of numeric array */
export function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Calculate percentile (0-100) from sorted array */
export function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Format duration in seconds to human-readable string */
export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return 'N/A';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m ${secs}s`;
}

/** Format milliseconds to human-readable */
export function formatMs(ms) {
  if (ms == null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format a Date to locale string */
export function formatTimestamp(date) {
  if (!date) return 'N/A';
  return date.toLocaleString();
}

/** Truncate a string with ellipsis */
export function truncate(str, len = 20) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

/** Count words in a string */
export function wordCount(str) {
  if (!str || !str.trim()) return 0;
  return str.trim().split(/\s+/).length;
}

/**
 * Typed event fields for a system-log entry. Most actions carry them in a
 * nested `metadata` object, but the ai_conversation_system_log emission path
 * (function_error, function_loop, swaig_problem, change_step_failed,
 * double_turn, inner_dialog, inner_dialog_scorecard) writes them as flat
 * top-level keys with no metadata object.
 */
export function fieldsOf(entry) {
  if (!entry) return {};
  if (entry.metadata && typeof entry.metadata === 'object') return entry.metadata;
  return entry;
}

/**
 * A measured latency in ms, else null. Per the enriched call_log spec,
 * JSON null means "not measured" and 0 is the "no acoustic origin" sentinel
 * on assistant-manual entries — neither is a real measurement.
 */
export function measuredMs(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}

const CALLER_STAMP_WALL_TWINS = {
  speech_start: 'speech_start_wall_us',
  last_word_end: 'last_word_end_wall_us',
  turn_decided: 'turn_decided_wall_us',
  status_pushed: 'status_pushed_wall_us',
};

export const STAMP_KEYS = [
  'speech_start', 'last_word_end', 'suspected_end', 'turn_decided',
  'status_pushed', 'request_detect', 'first_token', 'first_utterance',
  'first_audio',
];

/**
 * Unified turn-timeline stamps (wall-clock µs) for an assistant entry.
 * Prefers stamps_us; the four caller stamps fall back to their flat
 * *_wall_us twins. Only positive values are kept — a key is absent when
 * its stamp is unknown (no preceding user turn, OART mode, manual entry).
 */
export function stampsOf(entry) {
  if (!entry) return {};
  const stamps = (entry.stamps_us && typeof entry.stamps_us === 'object') ? entry.stamps_us : {};
  const out = {};
  for (const key of STAMP_KEYS) {
    let v = measuredMs(stamps[key]);
    if (v == null && CALLER_STAMP_WALL_TWINS[key]) {
      v = measuredMs(entry[CALLER_STAMP_WALL_TWINS[key]]);
    }
    if (v != null) out[key] = v;
  }
  return out;
}

/** Collapse whitespace for content-based matching across log arrays */
export function stripText(str) {
  return typeof str === 'string' ? str.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Strip inline `~LN(lang)-;` TTS language directives that ride along in
 * spoken text so rendered transcripts read clean.
 */
export function cleanText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/~LN\([^)]*\)-;?\s*/g, '').replace(/[ \t]{2,}/g, ' ').trim();
}
