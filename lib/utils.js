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
