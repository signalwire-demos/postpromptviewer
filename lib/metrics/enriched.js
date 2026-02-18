/**
 * Compute metrics from enriched call_log event types.
 */
export function computeEnriched(data) {
  const callLog = data.callLog || [];

  let functionCallCount = 0;
  let functionErrorCount = 0;
  let gatherAttemptCount = 0;
  let gatherRejectCount = 0;
  let gatherAttemptValues = [];
  let hearingHintCount = 0;
  let pronounceRuleCount = 0;
  let fillerCount = 0;
  let attentionTimeoutCount = 0;
  let startupHookDuration = null;

  for (const entry of callLog) {
    if (entry.role !== 'system-log' || !entry.action) continue;
    const m = entry.metadata || {};

    switch (entry.action) {
      case 'function_call':
        functionCallCount++;
        break;
      case 'function_error':
        functionErrorCount++;
        break;
      case 'gather_answer':
        gatherAttemptCount++;
        if (m.attempt != null) gatherAttemptValues.push(m.attempt);
        break;
      case 'gather_reject':
        gatherRejectCount++;
        break;
      case 'hearing_hint':
        hearingHintCount++;
        break;
      case 'pronounce_rule':
        pronounceRuleCount++;
        break;
      case 'filler':
        fillerCount++;
        break;
      case 'attention_timeout':
        attentionTimeoutCount++;
        break;
      case 'startup_hook':
        startupHookDuration = m.duration_ms || 0;
        break;
    }
  }

  const functionErrorRate = functionCallCount > 0
    ? functionErrorCount / functionCallCount
    : 0;

  const totalGatherAttempts = gatherAttemptCount + gatherRejectCount;
  const gatherRejectionRate = totalGatherAttempts > 0
    ? gatherRejectCount / totalGatherAttempts
    : 0;

  const avgGatherAttempts = gatherAttemptValues.length > 0
    ? gatherAttemptValues.reduce((a, b) => a + b, 0) / gatherAttemptValues.length
    : 0;

  const textRewriteCount = hearingHintCount + pronounceRuleCount;

  return {
    functionCallCount,
    functionErrorCount,
    functionErrorRate,
    gatherAttemptCount,
    gatherRejectCount,
    gatherRejectionRate,
    avgGatherAttempts,
    hearingHintCount,
    pronounceRuleCount,
    textRewriteCount,
    fillerCount,
    attentionTimeoutCount,
    startupHookDuration,
  };
}
