import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTrace } from '../lib/metrics/trace.js';
import { computeScorecard, parseScorecardText } from '../lib/metrics/scorecard.js';
import { cleanText } from '../lib/utils.js';

const US = 1_000_000;
const T0 = 1_781_389_930_000_000;

test('trace: groups exchanges, thinking/system never perturb grouping', () => {
  const data = {
    callLog: [
      { role: 'assistant', content: 'Welcome to support.', timestamp: T0 }, // greeting
      { role: 'user', content: 'Where is my order?', timestamp: T0 + 5 * US, confidence: 0.95 },
      { role: 'assistant-thinking', content: 'The user wants order status.', timestamp: T0 + 6 * US },
      { role: 'system-log', action: 'function_call', timestamp: T0 + 6.5 * US, metadata: { function: 'check_order' } },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', function: { name: 'check_order', arguments: '{"id":7}' } }], timestamp: T0 + 6.6 * US },
      { role: 'tool', function_name: 'check_order', tool_call_id: 'call_1', content: 'Shipped', timestamp: T0 + 7 * US, start_timestamp: T0 + 6.7 * US, end_timestamp: T0 + 7 * US },
      { role: 'assistant', content: 'It shipped yesterday.', timestamp: T0 + 8 * US, latency: 700, audio_latency: 900 },
    ],
    swaigLog: [{ command_name: 'check_order', command_arg: '{"id":7}', url: 'https://x.test/hook' }],
  };
  const { exchanges } = buildTrace(data);
  assert.equal(exchanges.length, 2); // greeting + one user exchange
  assert.equal(exchanges[0].user, null);
  assert.equal(exchanges[1].user.text, 'Where is my order?');
  assert.equal(exchanges[1].replyText, 'It shipped yesterday.');
  assert.equal(exchanges[1].tools.length, 1);
  assert.equal(exchanges[1].tools[0].name, 'check_order');
  assert.equal(exchanges[1].tools[0].args, '{"id":7}'); // via tool_call_id
  assert.equal(exchanges[1].tools[0].executionMs, 300);
  assert.equal(exchanges[1].tools[0].url, 'https://x.test/hook');
});

test('trace: filler onset is the exchange hero; stages derive from stamps', () => {
  const lastWordEnd = T0 + 10 * US;
  const data = {
    callLog: [
      {
        role: 'user', content: 'Look up my account please.', timestamp: lastWordEnd,
        eot: { basis: 'natural', confidence: 0.9 },
      },
      {
        role: 'assistant-manual', content: 'One moment.', timestamp: T0 + 11 * US,
        latency: 0, utterance_latency: 0, audio_latency: 0,
        stamps_us: { first_audio: lastWordEnd + 700_000 },
      },
      {
        role: 'assistant', content: 'Found it.', timestamp: T0 + 14 * US,
        latency: 900, audio_latency: 1100, acoustic_latency: 2600,
        stamps_us: {
          last_word_end: lastWordEnd,
          turn_decided: lastWordEnd + 300_000,
          status_pushed: lastWordEnd + 320_000,
          request_detect: lastWordEnd + 340_000,
          first_token: lastWordEnd + 1_200_000,
          first_utterance: lastWordEnd + 1_400_000,
          first_audio: lastWordEnd + 2_600_000,
        },
      },
    ],
    swaigLog: [],
  };
  const { exchanges, stats } = buildTrace(data);
  assert.equal(exchanges.length, 1);
  const ex = exchanges[0];
  assert.equal(ex.heroMs, 700); // the filler is what the caller heard first
  assert.equal(ex.heroKind, 'mouth-to-ear');
  assert.equal(ex.speed, 'fast');
  assert.equal(ex.verdict.kind, 'clean');
  // filler_audio milestone lands between the stamps in time order
  assert.ok(ex.milestones.some(m => m.key === 'filler_audio'));
  const cats = ex.stages.map(s => s.cat);
  assert.ok(cats.includes('turn-detect'));
  assert.ok(cats.includes('llm'));
  assert.equal(stats.count, 1);
  assert.equal(stats.avg, 700);
});

test('trace: post-prompt summary text is excluded from exchanges', () => {
  const data = {
    callLog: [
      { role: 'user', content: 'Bye.', timestamp: T0 },
      { role: 'assistant', content: 'Goodbye!', timestamp: T0 + US, audio_latency: 500 },
      { role: 'assistant', content: 'SUMMARY: user said goodbye.', timestamp: T0 + 2 * US },
    ],
    swaigLog: [],
    conversationSummary: 'SUMMARY: user said goodbye.',
  };
  const { exchanges } = buildTrace(data);
  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].replyText, 'Goodbye!');
});

test('scorecard: global_data bars with frustration inverted + dialog parsing', () => {
  const data = {
    globalData: { scorecard: { satisfaction: 0.9, frustration: 0.2, outcome: 'resolved', v: 1 } },
    callLog: [
      { role: 'system-log', action: 'inner_dialog_scorecard', timestamp: T0, content: 'engagement: 0.8\nconfusion=0.7' },
    ],
  };
  const sc = computeScorecard(data);
  assert.ok(sc.global && sc.dialog);

  const satisfaction = sc.global.bars.find(b => b.key === 'satisfaction');
  assert.equal(satisfaction.pct, 90);
  assert.equal(satisfaction.good, true);

  const frustration = sc.global.bars.find(b => b.key === 'frustration');
  assert.equal(frustration.good, true); // low frustration is good
  assert.equal(frustration.inverted, true);

  assert.deepEqual(sc.global.chips, [{ key: 'outcome', value: 'resolved' }]);
  assert.ok(!sc.global.bars.some(b => b.key === 'v')); // version key skipped

  const confusion = sc.dialog.bars.find(b => b.key === 'confusion');
  assert.equal(confusion.good, false); // high confusion is bad
});

test('parseScorecardText handles mixed separators and junk lines', () => {
  const parsed = parseScorecardText('quality: 0.75, notes = went well\nnot a pair line');
  assert.deepEqual(parsed, { quality: '0.75', notes: 'went well' });
  assert.equal(parseScorecardText(''), null);
});

test('cleanText strips inline TTS language directives', () => {
  assert.equal(cleanText('~LN(en-US)-;Hello there'), 'Hello there');
  assert.equal(cleanText('Start ~LN(fr-FR)-; middle end'), 'Start middle end');
  assert.equal(cleanText('No directives here'), 'No directives here');
});
