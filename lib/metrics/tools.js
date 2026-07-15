import { mean } from '../utils.js';

export function computeTools(data) {
  const swaigCallCount = data.swaigLog.length;

  const toolBreakdown = {};
  const actionTypes = new Set();
  const ensure = (name) => {
    if (!toolBreakdown[name]) {
      toolBreakdown[name] = { count: 0, executionLatencies: [], turnAudioLatencies: [], distilledCount: 0 };
    }
    return toolBreakdown[name];
  };

  for (const entry of data.swaigLog) {
    ensure(entry.command_name || 'unknown').count++;

    if (entry.post_response) {
      const actions = entry.post_response.action;
      if (Array.isArray(actions)) {
        for (const action of actions) {
          for (const key of Object.keys(action)) {
            actionTypes.add(key);
          }
        }
      }
    }
  }

  // Tool entries carry their identity directly in function_name — no
  // swaig_log timestamp matching needed. Their latency triple
  // (latency / function_latency / execution_latency) is the surrounding
  // LLM turn's, NOT the function's own timing; the function's real
  // execution time is end_timestamp − start_timestamp (µs).
  const toolMsgs = data.callLog.filter(m => m.role === 'tool');
  for (const toolMsg of toolMsgs) {
    const name = toolMsg.function_name || 'unknown';
    const b = ensure(name);
    if (!data.swaigLog.length) b.count++;

    if (toolMsg.start_timestamp && toolMsg.end_timestamp) {
      b.executionLatencies.push(Math.round((toolMsg.end_timestamp - toolMsg.start_timestamp) / 1000));
    }
    if (toolMsg.execution_latency != null && toolMsg.execution_latency > 0) {
      b.turnAudioLatencies.push(toolMsg.execution_latency);
    }
    if (toolMsg.distilled) b.distilledCount++;
  }

  // Aggregate across all tools
  const allExecLatencies = [];
  const allTurnAudioLatencies = [];
  let distilledCount = 0;
  for (const b of Object.values(toolBreakdown)) {
    allExecLatencies.push(...b.executionLatencies);
    allTurnAudioLatencies.push(...b.turnAudioLatencies);
    distilledCount += b.distilledCount;
  }

  return {
    swaigCallCount,
    // Real function execution time (end_timestamp − start_timestamp)
    avgExecutionLatency: mean(allExecLatencies),
    // Surrounding turn's audio latency (the deprecated execution_latency
    // alias) — how long the whole turn took to produce audio, kept for
    // context alongside the real execution time.
    avgTurnAudioLatency: mean(allTurnAudioLatencies),
    distilledCount,
    toolBreakdown,
    actionTypes: [...actionTypes],
    toolCallRate: null, // set by computeMetrics in index.js
  };
}
