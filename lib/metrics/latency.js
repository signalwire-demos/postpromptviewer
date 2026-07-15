import { mean, percentile, measuredMs, stampsOf, stripText } from '../utils.js';

/**
 * Compute latency metrics from call_log and times[].
 *
 * Anchored at request_detect (Deepgram final delivered), per the enriched
 * call_log spec the model+delivery pipeline decomposes additively:
 *   LLM Latency          = latency (time to first token)
 *   Utterance Processing = utterance_latency - latency
 *   Audio Delivery       = audio_latency - utterance_latency
 *
 * The turn-detection portion is anchored earlier, at the user's last spoken
 * word: eos_to_push_latency (of which dg_decision_latency is mod_deepgram
 * internal), then the poll gap (status_pushed → request_detect). The
 * full-extent user-perceived number is acoustic_latency
 * (first_audio − last_word_end).
 *
 * null / 0 handling: JSON null means "not measured"; 0 is the sentinel on
 * assistant-manual entries ("no acoustic origin"). Neither enters stats.
 */
export function computeLatency(data) {
  // Responses that can carry latency: assistant, assistant-manual (fillers
  // get a back-filled acoustic_latency + stamps_us.first_audio), and tool.
  const responseLogs = [];
  for (const msg of data.callLog) {
    if (msg.role !== 'assistant' && msg.role !== 'assistant-manual' && msg.role !== 'tool') continue;
    const hasLatency = ['latency', 'utterance_latency', 'audio_latency', 'acoustic_latency']
      .some(f => measuredMs(msg[f]) != null);
    const stamps = stampsOf(msg);
    if (!hasLatency && Object.keys(stamps).length === 0) continue;
    responseLogs.push(msg);
  }

  // Pool of times[] entries for text matching (spec: times[] is
  // per-generation — barged/regenerated and tool-only rounds included —
  // so index N is not the Nth spoken turn; match by response text).
  const timesPool = (data.times || []).map((t, i) => ({
    index: i,
    text: stripText(t.response),
    entry: t,
    consumed: false,
  }));
  const matchPerf = (content) => {
    const text = stripText(content);
    if (!text) return null;
    for (const p of timesPool) {
      if (p.consumed || !p.text) continue;
      if (p.text === text || p.text.startsWith(text) || text.startsWith(p.text)) {
        p.consumed = true;
        return {
          timesIndex: p.index,
          answerTime: p.entry.answer_time ?? null,
          tokenTime: p.entry.token_time ?? null,
          tokens: p.entry.tokens ?? null,
          tps: p.entry.tps ?? p.entry.avg_tps ?? null,
          words: p.entry.response_word_count ?? null,
        };
      }
    }
    return null;
  };

  // Per-response breakdown
  const perResponseBreakdown = responseLogs.map((log, i) => {
    const latency = measuredMs(log.latency);
    const utteranceLatency = measuredMs(log.utterance_latency);
    const audioLatency = measuredMs(log.audio_latency);
    const acousticLatency = measuredMs(log.acoustic_latency);
    const eosToPush = measuredMs(log.eos_to_push_latency);
    const dgDecision = measuredMs(log.dg_decision_latency);
    const poll = measuredMs(log.poll);
    const stamps = stampsOf(log);

    // Additive model+delivery segments (all share the request_detect anchor)
    const llm = latency || 0;
    const utteranceProcessing = utteranceLatency != null ? Math.max(0, utteranceLatency - llm) : 0;
    const audioDelivery = audioLatency != null ? Math.max(0, audioLatency - (utteranceLatency ?? llm)) : 0;
    const total = audioLatency ?? utteranceLatency ?? latency ?? null;

    // Stamp-derived mouth-to-ear (µs → ms); cross-checks acoustic_latency
    const mouthToEarMs = (stamps.first_audio && stamps.last_word_end)
      ? Math.round((stamps.first_audio - stamps.last_word_end) / 1000)
      : null;

    // Tool entries: the latency triple is the surrounding LLM turn's, not
    // the function's own timing. Real execution time is end − start.
    const functionExecutionMs = (log.role === 'tool' && log.start_timestamp && log.end_timestamp)
      ? Math.round((log.end_timestamp - log.start_timestamp) / 1000)
      : null;

    return {
      index: i,
      role: log.role,
      isManual: log.role === 'assistant-manual',
      // Additive segments for the stacked bar (anchored at request_detect)
      llm,
      utteranceProcessing,
      audioDelivery,
      // Turn-detection segments (anchored at last_word_end)
      turnDetection: eosToPush,
      dgDecision,
      poll,
      total: total ?? 0,
      // Raw fields — null means "not measured", never 0
      latency,
      utteranceLatency,
      audioLatency,
      acousticLatency,
      eosToPushLatency: eosToPush,
      dgDecisionLatency: dgDecision,
      // Full user-perceived extent: prefer the emitted field, fall back to
      // the stamp identity acoustic = first_audio − last_word_end.
      perceivedTotal: acousticLatency ?? mouthToEarMs,
      mouthToEarMs,
      stamps,
      functionExecutionMs,
      // Aliases of the surrounding turn's audio/utterance latency (spec:
      // deprecated names on tool entries, NOT the tool's own timing)
      executionLatency: measuredMs(log.execution_latency),
      functionLatency: measuredMs(log.function_latency),
      // Per-generation perf from times[], matched by response text
      perf: (log.role === 'assistant' && log.content) ? matchPerf(log.content) : null,
      barged: !!log.barged,
    };
  });

  // Split by role
  const assistantResponses = perResponseBreakdown.filter(r => r.role === 'assistant');
  const toolResponses = perResponseBreakdown.filter(r => r.role === 'tool');

  const calcStats = (values, { target } = {}) => {
    const vals = values.filter(v => v != null);
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      avg: Math.round(mean(vals)),
      min: Math.min(...vals),
      max: Math.max(...vals),
      median: Math.round(sorted[Math.floor(sorted.length / 2)]),
      p95: Math.round(percentile(vals, 95)),
      count: vals.length,
      ...(target ? { underTarget: vals.filter(v => v < target).length } : {}),
    };
  };

  const overallStats = calcStats(perResponseBreakdown.map(r => r.total || null), { target: 1200 });
  const assistantStats = calcStats(assistantResponses.map(r => r.audioLatency), { target: 1200 });
  const toolStats = calcStats(toolResponses.map(r => r.functionExecutionMs));

  // Full-pipeline stats (only present on new-format calls)
  const acousticStats = calcStats(
    perResponseBreakdown.filter(r => !r.isManual || r.acousticLatency != null)
      .map(r => r.perceivedTotal),
  );
  const eosToPushStats = calcStats(assistantResponses.map(r => r.eosToPushLatency));
  const dgDecisionStats = calcStats(assistantResponses.map(r => r.dgDecisionLatency));
  const pollStats = calcStats(assistantResponses.map(r => r.poll));

  // Per-exchange perceived latency: when a filler precedes a tool-backed
  // answer both entries share the last_word_end anchor — the filler's onset
  // is what the caller actually heard first, so take the earliest per anchor.
  const byAnchor = new Map();
  for (const r of perResponseBreakdown) {
    if (r.perceivedTotal == null) continue;
    const anchor = r.stamps.last_word_end || `idx:${r.index}`;
    const cur = byAnchor.get(anchor);
    if (cur == null || r.perceivedTotal < cur) byAnchor.set(anchor, r.perceivedTotal);
  }
  const perceivedStats = calcStats([...byAnchor.values()]);

  // Performance rating (based on assistant avg only)
  let performanceRating = 'N/A';
  let performanceColor = '#6b7280';
  if (assistantStats) {
    if (assistantStats.avg < 1200) {
      performanceRating = 'Excellent';
      performanceColor = '#10b981';
    } else if (assistantStats.avg < 1800) {
      performanceRating = 'Good';
      performanceColor = '#3b82f6';
    } else if (assistantStats.avg < 2500) {
      performanceRating = 'Fair';
      performanceColor = '#f59e0b';
    } else {
      performanceRating = 'Needs Improvement';
      performanceColor = '#ef4444';
    }
  }

  // P95 response latency from spoken-generation answer_times
  const assistantAnswerTimes = data.times
    .filter(t => t.answer_time != null && t.answer_time > 0 && t.response_word_count > 0)
    .map(t => t.answer_time);
  const p95AnswerTime = assistantStats
    ? Math.round(percentile(assistantAnswerTimes, 95) * 1000)
    : null;

  // Agent response count: assistant messages with spoken content (not tool-call-only)
  const agentResponseCount = data.callLog.filter(
    m => m.role === 'assistant' && m.content && m.content.trim() &&
      (measuredMs(m.audio_latency) || measuredMs(m.utterance_latency) || measuredMs(m.latency))
  ).length;

  // Average response length in words
  const responseWordCounts = data.times
    .map(t => t.response_word_count || 0)
    .filter(c => c > 0);
  const avgResponseLength = responseWordCounts.length
    ? mean(responseWordCounts)
    : 0;

  // Per-generation view of times[] (for the TPS chart). A generation whose
  // text matched no spoken turn is an abandoned/regenerated or tool-call
  // round — the blessed call_log collapsed it away.
  const perResponseTimes = timesPool.map(p => ({
    index: p.index,
    answerTime: p.entry.answer_time || 0,
    tokenTime: p.entry.token_time || 0,
    responseWordCount: p.entry.response_word_count || 0,
    isToolCall: p.entry.response_word_count === 0 && (p.entry.tokens ?? 0) <= 1,
    matchedSpokenTurn: p.consumed,
  }));

  return {
    perResponseBreakdown,
    responseLogs,
    overallStats,
    assistantStats,
    acousticStats,
    perceivedStats,
    eosToPushStats,
    dgDecisionStats,
    pollStats,
    toolStats,
    performanceRating,
    performanceColor,
    perResponseTimes,
    p95AnswerTime,
    agentResponseCount,
    avgResponseLength,
  };
}
