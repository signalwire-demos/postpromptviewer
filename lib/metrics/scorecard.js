import { fieldsOf } from '../utils.js';

// Metrics where LOW is good (bar colors invert)
const INVERTED = new Set(['frustration', 'anger', 'confusion', 'repetition']);

// Keys that aren't quality metrics
const SKIP_KEYS = new Set(['v', 'version']);

function toEntries(obj) {
  const bars = [];
  const chips = [];
  for (const [key, value] of Object.entries(obj || {})) {
    if (SKIP_KEYS.has(key.toLowerCase())) continue;
    const num = typeof value === 'number' ? value : Number(value);
    if (isFinite(num) && String(value).trim() !== '' && num >= 0 && num <= 1) {
      const pct = Math.round(num * 100);
      bars.push({
        key,
        value: num,
        pct,
        good: INVERTED.has(key.toLowerCase()) ? num <= 0.5 : num >= 0.5,
        inverted: INVERTED.has(key.toLowerCase()),
      });
    } else {
      chips.push({ key, value: String(value) });
    }
  }
  return { bars, chips };
}

/**
 * Parse an inner_dialog_scorecard content string into metrics.
 * Accepts "key=value" / "key: value" lines (and comma-separated pairs).
 */
export function parseScorecardText(content) {
  if (!content || typeof content !== 'string') return null;
  const obj = {};
  const pairs = content.split(/[\n,;]+/);
  for (const pair of pairs) {
    const m = pair.match(/^\s*([A-Za-z_][\w .-]*?)\s*[:=]\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key) obj[key] = value;
  }
  return Object.keys(obj).length ? obj : null;
}

/**
 * Scorecards from both sources: global_data.scorecard (set by the agent)
 * and the latest inner_dialog_scorecard system-log entry (utility-model
 * self-assessment, content-only flat-key action).
 */
export function computeScorecard(data) {
  const out = { global: null, dialog: null };

  const gd = data.globalData || {};
  if (gd.scorecard && typeof gd.scorecard === 'object') {
    const entries = toEntries(gd.scorecard);
    if (entries.bars.length || entries.chips.length) out.global = entries;
  }

  let lastDialog = null;
  for (const entry of (data.callLog || [])) {
    if (entry.role !== 'system-log' || entry.action !== 'inner_dialog_scorecard') continue;
    lastDialog = entry.content || fieldsOf(entry).content || null;
  }
  const parsed = parseScorecardText(lastDialog);
  if (parsed) {
    const entries = toEntries(parsed);
    if (entries.bars.length || entries.chips.length) out.dialog = entries;
  }

  return (out.global || out.dialog) ? out : null;
}
