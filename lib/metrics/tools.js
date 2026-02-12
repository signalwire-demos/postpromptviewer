import { mean } from '../utils.js';

export function computeTools(data) {
  const swaigCallCount = data.swaigLog.length;

  const toolBreakdown = {};
  const actionTypes = new Set();

  for (const entry of data.swaigLog) {
    const name = entry.command_name || 'unknown';
    if (!toolBreakdown[name]) {
      toolBreakdown[name] = { count: 0, executionLatencies: [], functionLatencies: [] };
    }
    toolBreakdown[name].count++;

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

  // Match swaig_log entries to their tool messages in call_log for latency data
  for (const entry of data.swaigLog) {
    const name = entry.command_name || 'unknown';
    const toolMsg = data.callLog.find(
      m => m.role === 'tool' && m.timestamp && entry.epoch_time &&
        Math.abs(m.timestamp / 1_000_000 - entry.epoch_time) < 5
    );
    if (toolMsg) {
      if (toolMsg.execution_latency != null) {
        toolBreakdown[name].executionLatencies.push(toolMsg.execution_latency);
      }
      if (toolMsg.function_latency != null) {
        toolBreakdown[name].functionLatencies.push(toolMsg.function_latency);
      }
    }
  }

  // Aggregate across all tools
  const allExecLatencies = [];
  const allFuncLatencies = [];
  for (const b of Object.values(toolBreakdown)) {
    allExecLatencies.push(...b.executionLatencies);
    allFuncLatencies.push(...b.functionLatencies);
  }

  return {
    swaigCallCount,
    avgExecutionLatency: mean(allExecLatencies),
    avgFunctionLatency: mean(allFuncLatencies),
    toolBreakdown,
    actionTypes: [...actionTypes],
    toolCallRate: null, // set by computeMetrics in index.js
  };
}
