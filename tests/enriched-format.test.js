import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePayload } from '../lib/parser.js';
import { fieldsOf, stampsOf, measuredMs } from '../lib/utils.js';
import { computeEnriched } from '../lib/metrics/enriched.js';
import { computeLatency } from '../lib/metrics/latency.js';
import { computeAsr } from '../lib/metrics/asr.js';
import { computeTools } from '../lib/metrics/tools.js';

// ---------------------------------------------------------------------------
// Synthetic fixtures modeled on ENRICHED_CALL_LOG.md (no sample JSON reuse)
// ---------------------------------------------------------------------------

const US = 1_000_000;
const T0 = 1_781_389_930_000_000; // arbitrary wall-clock µs base

function basePayload(overrides = {}) {
  return {
    call_id: 'test-call',
    action: 'post_conversation',
    call_start_date: T0,
    call_end_date: T0 + 60 * US,
    call_log: [],
    ...overrides,
  };
}

test('fieldsOf reads nested metadata and flat top-level shapes', () => {
  const nested = {
    role: 'system-log', action: 'step_change',
    metadata: { from_step: 'greet', to_step: 'collect', trigger: 'ai_function' },
  };
  const flat = {
    role: 'system-log', action: 'function_error',
    function: 'check_order', error: 'invalid parameters', details: 'missing arg: id',
  };
  assert.equal(fieldsOf(nested).to_step, 'collect');
  assert.equal(fieldsOf(flat).function, 'check_order');
  assert.equal(fieldsOf(flat).details, 'missing arg: id');
});

test('measuredMs treats null and the 0 sentinel as not-measured', () => {
  assert.equal(measuredMs(450), 450);
  assert.equal(measuredMs(0), null);
  assert.equal(measuredMs(null), null);
  assert.equal(measuredMs(undefined), null);
});

test('stampsOf prefers stamps_us and falls back to *_wall_us twins', () => {
  const entry = {
    stamps_us: { first_audio: T0 + 3 * US, request_detect: T0 + 2 * US },
    last_word_end_wall_us: T0 + 1 * US,
    turn_decided_wall_us: T0 + 1.5 * US,
  };
  const s = stampsOf(entry);
  assert.equal(s.first_audio, T0 + 3 * US);
  assert.equal(s.last_word_end, T0 + 1 * US);
  assert.equal(s.turn_decided, T0 + 1.5 * US);
  assert.ok(!('speech_start' in s));
});

test('parser joins barge metadata from raw_call_log onto blessed entries by text', () => {
  const spoken = 'Thank you for calling. I can help you with your order today.';
  const payload = basePayload({
    call_log: [
      { role: 'assistant', content: spoken, timestamp: T0 + 5 * US, latency: 400 },
    ],
    raw_call_log: [
      {
        role: 'assistant', content: spoken,
        timestamp: T0 + 5 * US + 123, // raw copy stamped at a different µs
        barged: true, barge_elapsed_ms: 3200,
        text_heard_approx: 'Thank you for calling.',
        text_spoken_total: spoken,
      },
    ],
  });
  const parsed = parsePayload(payload);
  const assistant = parsed.callLog.find(e => e.role === 'assistant');
  assert.equal(assistant.barged, true);
  assert.equal(assistant.barge_elapsed_ms, 3200);
  assert.equal(assistant.text_heard_approx, 'Thank you for calling.');
});

test('parser surfaces session_end reason and ended_by', () => {
  const payload = basePayload({
    call_end_date: 0,
    call_log: [
      {
        role: 'system-log', action: 'session_end', timestamp: T0 + 30 * US,
        metadata: { reason: 'end_call', ended_by: 'assistant' },
      },
    ],
  });
  const parsed = parsePayload(payload);
  assert.equal(parsed.sessionEndReason, 'end_call');
  assert.equal(parsed.callEndedBy, 'assistant');
  assert.equal(parsed.callEndDate, T0 + 30 * US);
});

test('enriched counts flat-key actions and reads production function_error fields', () => {
  const data = {
    callLog: [
      { role: 'system-log', action: 'function_call', metadata: { function: 'check_order', native: false } },
      { role: 'system-log', action: 'function_error', function: 'lookup', error: 'non-existent function' },
      { role: 'system-log', action: 'function_loop', function: 'check_order', type: 'repeated' },
      { role: 'system-log', action: 'swaig_problem', function: 'check_order', error: 'no response from webhook' },
      { role: 'system-log', action: 'change_step_failed', name: 'no_such_step' },
      { role: 'system-log', action: 'double_turn', content: 'directive text' },
      { role: 'system-log', action: 'inner_dialog', content: 'scratchpad' },
      { role: 'system-log', action: 'inner_dialog_scorecard', content: 'frustration=0.1' },
    ],
    callTimeline: null,
  };
  const m = computeEnriched(data);
  assert.equal(m.functionCallCount, 1);
  assert.equal(m.functionErrorCount, 1);
  assert.deepEqual(m.functionErrors[0], { function: 'lookup', error: 'non-existent function', details: null });
  assert.equal(m.functionLoopCount, 1);
  assert.equal(m.swaigProblemCount, 1);
  assert.equal(m.changeStepFailedCount, 1);
  assert.equal(m.doubleTurnCount, 1);
  assert.equal(m.innerDialogCount, 1);
  assert.equal(m.innerDialogScorecardCount, 1);
});

test('enriched reads text_normalize/pronounce from call_timeline synthetics only', () => {
  const data = {
    callLog: [],
    callTimeline: [
      { ts: T0, type: 'text_normalize', direction: 'itn', original: 'four one five', normalized: '415' },
      { ts: T0 + US, type: 'pronounce', original: 'SWML', result: 'swimmel' },
      { ts: T0 + 2 * US, type: 'pronounce', original: 'API', result: 'A P I' },
    ],
  };
  const m = computeEnriched(data);
  assert.equal(m.textNormalizeCount, 1);
  assert.equal(m.pronounceCount, 2);
  assert.equal(m.textRewriteCount, 3);
});

test('enriched counts text-mode fillers (assistant-manual without filler event)', () => {
  const data = {
    callLog: [
      { role: 'assistant-manual', content: 'Querying the knowledge base', timestamp: T0 },
      { role: 'assistant-manual', content: 'Bear with me, I need to rethink that.', timestamp: T0 + US },
      {
        role: 'system-log', action: 'manual_say', timestamp: T0 + US,
        metadata: { text: 'Bear with me, I need to rethink that.', is_error: true, error_reason: 'invalid_function' },
      },
    ],
    callTimeline: null,
  };
  const m = computeEnriched(data);
  assert.equal(m.fillerCount, 0);
  assert.equal(m.textModeFillerCount, 1); // manual_say speech excluded
  assert.equal(m.totalFillerCount, 1);
  assert.equal(m.manualSayCount, 1);
  assert.equal(m.manualSayErrorCount, 1);
});

test('latency: null and 0 are not measurements; segments follow the spec table', () => {
  const data = {
    callLog: [
      {
        role: 'assistant', content: 'Hello!', timestamp: T0,
        latency: 500, utterance_latency: 650, audio_latency: 700,
        acoustic_latency: 1100, eos_to_push_latency: 250,
        dg_decision_latency: 12, poll: 150,
      },
      { // greeting: no user turn → derived metrics null
        role: 'assistant', content: 'Welcome.', timestamp: T0 + US,
        latency: 300, utterance_latency: 400, audio_latency: 450,
        acoustic_latency: null, eos_to_push_latency: null, dg_decision_latency: null, poll: null,
      },
      { // manual filler: 0 sentinel triple
        role: 'assistant-manual', content: 'One moment.', timestamp: T0 + 2 * US,
        latency: 0, utterance_latency: 0, audio_latency: 0, acoustic_latency: 900,
      },
    ],
    times: [],
  };
  const m = computeLatency(data);
  const [full, greeting, filler] = m.perResponseBreakdown;

  assert.equal(full.llm, 500);
  assert.equal(full.utteranceProcessing, 150);
  assert.equal(full.audioDelivery, 50);
  assert.equal(full.turnDetection, 250);
  assert.equal(full.poll, 150);
  assert.equal(full.perceivedTotal, 1100);

  assert.equal(greeting.acousticLatency, null);
  assert.equal(greeting.perceivedTotal, null);

  assert.equal(filler.latency, null); // 0 sentinel, not a measurement
  assert.equal(filler.perceivedTotal, 900); // back-filled filler acoustic

  // Stats: acoustic over measured values only
  assert.equal(m.acousticStats.count, 2);
  assert.equal(m.eosToPushStats.count, 1);
});

test('latency: filler and response sharing an anchor collapse to the filler onset', () => {
  const lastWordEnd = T0 + 10 * US;
  const data = {
    callLog: [
      {
        role: 'assistant-manual', content: 'Let me look that up.', timestamp: T0 + 11 * US,
        latency: 0, utterance_latency: 0, audio_latency: 0,
        acoustic_latency: 800,
        stamps_us: { last_word_end: lastWordEnd, first_audio: lastWordEnd + 800_000 },
      },
      {
        role: 'assistant', content: 'Your order shipped yesterday.', timestamp: T0 + 14 * US,
        latency: 900, utterance_latency: 1000, audio_latency: 1100,
        acoustic_latency: 2600,
        stamps_us: { last_word_end: lastWordEnd, first_audio: lastWordEnd + 2_600_000 },
      },
    ],
    times: [],
  };
  const m = computeLatency(data);
  assert.equal(m.perceivedStats.count, 1); // one exchange, not two
  assert.equal(m.perceivedStats.avg, 800); // the filler's onset is what the caller heard
  assert.equal(m.perResponseBreakdown[1].mouthToEarMs, 2600);
});

test('latency: times[] matched to spoken turns by response text, not index', () => {
  const data = {
    callLog: [
      { role: 'assistant', content: 'Got it, checking now.', timestamp: T0, latency: 400, utterance_latency: 500, audio_latency: 550 },
    ],
    times: [
      { response: '', response_word_count: 0, tokens: 1, answer_time: 0.8, tps: 0 }, // tool-only round
      { response: 'Got it, checking now.', response_word_count: 4, tokens: 12, answer_time: 1.2, tps: 40 },
    ],
  };
  const m = computeLatency(data);
  const perf = m.perResponseBreakdown[0].perf;
  assert.equal(perf.timesIndex, 1);
  assert.equal(perf.answerTime, 1.2);
  assert.equal(m.perResponseTimes[0].isToolCall, true);
  assert.equal(m.perResponseTimes[0].matchedSpokenTurn, false);
  assert.equal(m.perResponseTimes[1].matchedSpokenTurn, true);
});

test('tools: identity from function_name, execution time from end − start', () => {
  const data = {
    swaigLog: [
      { command_name: 'check_order', epoch_time: (T0 + 15 * US) / US, command_arg: '{}' },
    ],
    callLog: [
      {
        role: 'tool', function_name: 'check_order', content: 'Order found',
        tool_call_id: 'call_abc', timestamp: T0 + 15 * US,
        start_timestamp: T0 + 15 * US, end_timestamp: T0 + 15 * US + 234_000,
        latency: 500, function_latency: 450, execution_latency: 480,
      },
    ],
  };
  const m = computeTools(data);
  assert.equal(m.toolBreakdown.check_order.count, 1);
  assert.deepEqual(m.toolBreakdown.check_order.executionLatencies, [234]);
  assert.equal(m.avgExecutionLatency, 234);
  assert.equal(m.avgTurnAudioLatency, 480); // deprecated alias, surrounding turn
});

test('asr: entity / eot / timing telemetry aggregates', () => {
  const data = {
    callLog: [
      {
        role: 'user', content: '415-555-0192', timestamp: T0, confidence: 0.98,
        content_type: 'Detected Speech',
        entity: { type: 'phone', value: '+14155550192', valid: true },
        eot: { basis: 'entity_snap', confidence: 0.967 },
        timing: { hold_ms: 308, commit_latency_ms: 308, segments: 2, walkbacks: 1 },
      },
      {
        role: 'user', content: 'yes please', timestamp: T0 + 5 * US, confidence: 0.91,
        eot: { basis: 'ceiling', confidence: 0.42 },
        timing: { hold_ms: 0, commit_latency_ms: 4000, segments: 1, walkbacks: 3 },
      },
      { role: 'user', content: 'plain turn', timestamp: T0 + 8 * US, confidence: 0.9 },
    ],
    callTimeline: null,
  };
  const m = computeAsr(data);
  assert.equal(m.entities.length, 1);
  assert.equal(m.entities[0].value, '+14155550192');
  assert.deepEqual(m.eotBasisCounts, { entity_snap: 1, ceiling: 1 });
  assert.equal(m.ceilingCount, 1);
  assert.equal(m.heldTurnCount, 1);
  assert.equal(m.multiSegmentCount, 1);
  assert.equal(m.totalWalkbacks, 4);
  assert.equal(m.hasTurnTelemetry, true);
  assert.equal(m.avgCommitLatencyMs, (308 + 4000) / 2);
});
