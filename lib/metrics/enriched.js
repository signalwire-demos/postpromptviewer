import { fieldsOf, stripText } from '../utils.js';

/**
 * Compute metrics from enriched call_log event types.
 *
 * System-log entries come in two shapes: most actions carry a nested
 * `metadata` object, but the flat-key actions (function_error,
 * function_loop, swaig_problem, change_step_failed, double_turn,
 * inner_dialog, inner_dialog_scorecard) put their fields directly on the
 * entry. fieldsOf() abstracts over both.
 */
export function computeEnriched(data) {
  const callLog = data.callLog || [];

  let functionCallCount = 0;
  let functionErrorCount = 0;
  let functionLoopCount = 0;
  let swaigProblemCount = 0;
  let changeStepFailedCount = 0;
  let doubleTurnCount = 0;
  let gatherAttemptCount = 0;
  let gatherRejectCount = 0;
  let gatherAttemptValues = [];
  let hearingHintCount = 0;
  let pronounceCount = 0;
  let fillerCount = 0;
  let attentionTimeoutCount = 0;
  let startupHookDuration = null;
  let autoCorrectCount = 0;
  let innerDialogCount = 0;
  let innerDialogScorecardCount = 0;
  let textNormalizeCount = 0;
  let manualSayCount = 0;
  let manualSayErrorCount = 0;
  const functionErrors = [];
  const manualSayTexts = new Set();

  for (const entry of callLog) {
    if (entry.role !== 'system-log' || !entry.action) continue;
    const m = fieldsOf(entry);

    switch (entry.action) {
      case 'function_call':
        functionCallCount++;
        break;
      case 'function_error':
        functionErrorCount++;
        functionErrors.push({
          function: m.function || 'unknown',
          error: m.error || null,
          details: m.details || null,
        });
        break;
      case 'function_loop':
        functionLoopCount++;
        break;
      case 'swaig_problem':
        swaigProblemCount++;
        break;
      case 'change_step_failed':
        changeStepFailedCount++;
        break;
      case 'double_turn':
        doubleTurnCount++;
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
      case 'inner_dialog_scorecard':
        innerDialogScorecardCount++;
        break;
      case 'manual_say':
        manualSayCount++;
        if (m.is_error) manualSayErrorCount++;
        if (m.text) manualSayTexts.add(stripText(m.text));
        break;
    }
  }

  // ITN / pronounce-TN rewrites are not system-log entries — they surface
  // only as synthetic text_normalize / pronounce events in call_timeline.
  for (const entry of (data.callTimeline || [])) {
    if (entry.type === 'pronounce') pronounceCount++;
    else if (entry.type === 'text_normalize') textNormalizeCount++;
  }

  // Text-mode fillers speak via ais_say and land as assistant-manual entries
  // with no `filler` system-log event; count the ones that aren't manual_say
  // speech so filler stats hold in both modes.
  let textModeFillerCount = 0;
  for (const entry of callLog) {
    if (entry.role !== 'assistant-manual') continue;
    if (manualSayTexts.has(stripText(entry.content))) continue;
    textModeFillerCount++;
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

  const textRewriteCount = hearingHintCount + pronounceCount + autoCorrectCount + textNormalizeCount;

  // Redacted message count
  let redactedMessageCount = 0;
  for (const entry of callLog) {
    if ((entry.role === 'user' || entry.role === 'assistant') && entry.redacted) {
      redactedMessageCount++;
    }
  }

  // Barge-in metrics from assistant messages (caller interrupted the response).
  // The parser joins these in from raw_call_log — they never appear on the
  // blessed call_log natively.
  let bargedCount = 0;
  let bargeElapsedValues = [];
  let responseHeardPcts = [];
  let totalAssistantContent = 0;

  for (const entry of callLog) {
    if (entry.role !== 'assistant' || !entry.content) continue;
    totalAssistantContent++;

    if (!entry.barged) continue;
    bargedCount++;

    if (entry.barge_elapsed_ms != null) bargeElapsedValues.push(entry.barge_elapsed_ms);

    const heard = entry.text_heard_approx;
    const spoken = entry.text_spoken_total;
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
    functionErrors,
    functionLoopCount,
    swaigProblemCount,
    changeStepFailedCount,
    doubleTurnCount,
    gatherAttemptCount,
    gatherRejectCount,
    gatherRejectionRate,
    avgGatherAttempts,
    hearingHintCount,
    pronounceCount,
    // Back-compat alias: earlier builds counted these as "pronounce_rule"
    pronounceRuleCount: pronounceCount,
    autoCorrectCount,
    textNormalizeCount,
    textRewriteCount,
    fillerCount,
    textModeFillerCount,
    totalFillerCount: fillerCount + textModeFillerCount,
    manualSayCount,
    manualSayErrorCount,
    attentionTimeoutCount,
    startupHookDuration,
    innerDialogCount,
    innerDialogScorecardCount,
    redactedMessageCount,
    bargedCount,
    totalAssistantContent,
    bargedRate,
    avgBargeElapsedMs,
    avgResponseHeardPct,
  };
}
