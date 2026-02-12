import { mean, percentile } from '../utils.js';

/**
 * Compute latency metrics from call_log and times[].
 *
 * Latency is decomposed into additive segments:
 *   LLM Latency        = latency (time to first token)
 *   Utterance Processing = utterance_latency - latency
 *   Audio Delivery       = audio_latency - utterance_latency
 *
 * Assistant and tool latencies are tracked separately because
 * tool round-trip times are external and not AI-controllable.
 */
export function computeLatency(data) {
  // Extract all response logs (assistant + tool) that have latency data
  const responseLogs = [];
  for (const msg of data.callLog) {
    if ((msg.role === 'assistant' || msg.role === 'tool') &&
        (msg.latency != null || msg.audio_latency != null || msg.utterance_latency != null)) {
      responseLogs.push(msg);
    }
  }

  // Per-response stacked breakdown
  const perResponseBreakdown = responseLogs.map((log, i) => {
    const llm = log.latency || 0;
    const utteranceProcessing = Math.max(0, (log.utterance_latency || 0) - llm);
    const audioDelivery = Math.max(0, (log.audio_latency || 0) - (log.utterance_latency || 0));
    const total = log.audio_latency || log.utterance_latency || log.latency || 0;

    return {
      index: i,
      role: log.role,
      llm,
      utteranceProcessing,
      audioDelivery,
      total,
      // Raw fields for reference
      latency: log.latency || 0,
      utteranceLatency: log.utterance_latency || 0,
      audioLatency: log.audio_latency || 0,
      executionLatency: log.execution_latency || 0,
      functionLatency: log.function_latency || 0,
    };
  });

  // Split by role
  const assistantResponses = perResponseBreakdown.filter(r => r.role === 'assistant');
  const toolResponses = perResponseBreakdown.filter(r => r.role === 'tool');

  // Stats helper (uses total = audio_latency as the headline number)
  const calcStats = (items) => {
    if (items.length === 0) return null;
    const totals = items.map(r => r.total);
    const sorted = [...totals].sort((a, b) => a - b);
    const sum = totals.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / totals.length),
      min: Math.min(...totals),
      max: Math.max(...totals),
      median: Math.round(sorted[Math.floor(sorted.length / 2)]),
      count: totals.length,
      underTarget: totals.filter(t => t < 1200).length,
    };
  };

  const overallStats = calcStats(perResponseBreakdown);
  const assistantStats = calcStats(assistantResponses);
  const toolStats = calcStats(toolResponses);

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

  // P95 response latency from assistant answer_times
  const assistantAnswerTimes = data.times
    .filter(t => t.answer_time != null && t.answer_time > 0 && t.response_word_count > 0)
    .map(t => t.answer_time);
  const p95AnswerTime = assistantStats
    ? Math.round(percentile(assistantAnswerTimes, 95) * 1000)
    : null;

  // Agent response count: assistant messages with spoken content (not tool-call-only)
  const agentResponseCount = data.callLog.filter(
    m => m.role === 'assistant' && m.content && m.content.trim() &&
      (m.audio_latency || m.utterance_latency || m.latency)
  ).length;

  // Average response length in words
  const responseWordCounts = data.times
    .map(t => t.response_word_count || 0)
    .filter(c => c > 0);
  const avgResponseLength = responseWordCounts.length
    ? mean(responseWordCounts)
    : 0;

  // Per-response from times[] (for TPS chart, tag tool dispatches)
  const perResponseTimes = data.times.map((t, i) => {
    const isToolCall = t.response_word_count === 0 && t.tokens <= 1;
    return {
      index: i,
      answerTime: t.answer_time || 0,
      tokenTime: t.token_time || 0,
      responseWordCount: t.response_word_count || 0,
      isToolCall,
    };
  });

  return {
    perResponseBreakdown,
    responseLogs,
    overallStats,
    assistantStats,
    toolStats,
    performanceRating,
    performanceColor,
    perResponseTimes,
    p95AnswerTime,
    agentResponseCount,
    avgResponseLength,
  };
}
