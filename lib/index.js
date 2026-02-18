export { parsePayload } from './parser.js';
import { computeDuration } from './metrics/duration.js';
import { computeLatency } from './metrics/latency.js';
import { computeAsr } from './metrics/asr.js';
import { computeConversation } from './metrics/conversation.js';
import { computeTools } from './metrics/tools.js';
import { computeTokens } from './metrics/tokens.js';
import { computeEnriched } from './metrics/enriched.js';

export function computeMetrics(data) {
  const metrics = {
    duration: computeDuration(data),
    latency: computeLatency(data),
    asr: computeAsr(data),
    conversation: computeConversation(data),
    tools: computeTools(data),
    tokens: computeTokens(data),
    enriched: computeEnriched(data),
  };

  // Compute tool call rate (calls per minute of AI session)
  metrics.tools.toolCallRate = metrics.duration.aiSessionDuration > 0
    ? (metrics.tools.swaigCallCount / (metrics.duration.aiSessionDuration / 60))
    : 0;

  return metrics;
}
