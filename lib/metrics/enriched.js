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
  let autoCorrectCount = 0;
  let innerDialogCount = 0;
  let textNormalizeItnCount = 0;
  let textNormalizeTnCount = 0;

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
      case 'auto_correct':
        autoCorrectCount++;
        break;
      case 'inner_dialog':
        innerDialogCount++;
        break;
      case 'text_normalize':
        if (m.direction === 'itn') textNormalizeItnCount++;
        else if (m.direction === 'tn') textNormalizeTnCount++;
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

  const textRewriteCount = hearingHintCount + pronounceRuleCount + autoCorrectCount + textNormalizeItnCount + textNormalizeTnCount;

  // Redacted message count
  let redactedMessageCount = 0;
  for (const entry of callLog) {
    if ((entry.role === 'user' || entry.role === 'assistant') && entry.redacted) {
      redactedMessageCount++;
    }
  }

  // Barge-in metrics from assistant messages (caller interrupted the response)
  let bargedCount = 0;
  let bargeElapsedValues = [];
  let responseHeardPcts = [];
  let totalAssistantContent = 0;

  for (const entry of callLog) {
    if (entry.role !== 'assistant' || !entry.content) continue;
    totalAssistantContent++;

    const barged = entry.barged ?? entry.metadata?.barged ?? false;
    if (!barged) continue;
    bargedCount++;

    const elapsed = entry.barge_elapsed_ms ?? entry.metadata?.barge_elapsed_ms ?? null;
    if (elapsed != null) bargeElapsedValues.push(elapsed);

    const heard = entry.text_heard_approx ?? entry.metadata?.text_heard_approx ?? null;
    const spoken = entry.text_spoken_total ?? entry.metadata?.text_spoken_total ?? null;
    if (heard && spoken && spoken.length > 0) {
      responseHeardPcts.push((heard.length / spoken.length) * 100);
    }
  }

  const bargedRate = totalAssistantContent > 0 ? bargedCount / totalAssistantContent : 0;
  const avgBargeElapsedMs = bargeElapsedValues.length > 0
    ? Math.round(bargeElapsedValues.reduce((a, b) => a + b, 0) / bargeElapsedValues.length)
    : null;
  const avgResponseHeardPct = responseHeardPcts.length > 0
    ? Math.round(responseHeardPcts.reduce((a, b) => a + b, 0) / responseHeardPcts.length)
    : null;

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
    autoCorrectCount,
    textNormalizeItnCount,
    textNormalizeTnCount,
    textRewriteCount,
    fillerCount,
    attentionTimeoutCount,
    startupHookDuration,
    innerDialogCount,
    redactedMessageCount,
    bargedCount,
    totalAssistantContent,
    bargedRate,
    avgBargeElapsedMs,
    avgResponseHeardPct,
  };
}
