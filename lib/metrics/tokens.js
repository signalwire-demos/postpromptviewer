import { mean } from '../utils.js';

export function computeTokens(data) {
  // Sanitize TPS: server may return int64 overflow (e.g., -9223372036854776000)
  // when token_time is 0 (division by zero). Treat negative or absurd values as 0.
  const sanitizeTps = (v) => (v != null && isFinite(v) && v > 0 && v < 1e9) ? v : 0;

  const perResponseTps = data.times.map((t, i) => ({
    index: i,
    tps: sanitizeTps(t.tps),
    avgTps: sanitizeTps(t.avg_tps),
    tokens: t.tokens || 0,
  }));

  const tpsValues = perResponseTps
    .map(t => t.tps)
    .filter(v => v > 0);

  // Output tokens: use top-level field, or sum from times[].tokens as fallback
  const summedOutputTokens = perResponseTps.reduce((sum, r) => sum + r.tokens, 0);
  const totalOutputTokens = data.totalOutputTokens ?? (summedOutputTokens > 0 ? summedOutputTokens : null);
  const totalInputTokens = data.totalInputTokens ?? null;

  return {
    hasInputTokenData: totalInputTokens != null,
    hasOutputTokenData: totalOutputTokens != null,
    totalInputTokens,
    totalOutputTokens,
    totalWireInputTokens: data.totalWireInputTokens,
    totalWireOutputTokens: data.totalWireOutputTokens,
    totalWireInputTokensPerMinute: data.totalWireInputTokensPerMinute,
    totalWireOutputTokensPerMinute: data.totalWireOutputTokensPerMinute,
    totalTtsChars: data.totalTtsChars,
    totalTtsCharsPerMin: data.totalTtsCharsPerMin,
    totalAsrMinutes: data.totalAsrMinutes,
    totalAsrCostFactor: data.totalAsrCostFactor,
    totalMinutes: data.totalMinutes,
    avgTps: mean(tpsValues),
    peakTps: tpsValues.length ? Math.max(...tpsValues) : 0,
    perResponseTps,
  };
}
