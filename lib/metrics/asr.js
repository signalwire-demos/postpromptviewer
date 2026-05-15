import { mean } from '../utils.js';

export function computeAsr(data) {
  const userMessages = data.callLog.filter(m => m.role === 'user');
  const totalUserMessages = userMessages.length;

  // call_timeline emits `user_input` events that mirror user call_log entries
  // and may carry confidence + speaking_to_* fields when call_log doesn't.
  // Match by ts → call_log.timestamp.
  const timelineByTs = new Map();
  for (const e of (data.callTimeline || [])) {
    if (e.type === 'user_input' && e.ts) timelineByTs.set(e.ts, e);
  }
  const pick = (m, field) => (m[field] != null ? m[field] : timelineByTs.get(m.timestamp)?.[field]);

  // Per-message data for charts (confidence + text + ASR timing)
  // Negative speaking_to_turn_detection = barge-in (turn detection fired before
  // this utterance's reference point). Clamp negatives to 0 for charting.
  const perMessage = userMessages
    .filter(m => pick(m, 'confidence') != null)
    .map((m, i) => {
      const s2t = pick(m, 'speaking_to_turn_detection') || 0;
      const t2f = pick(m, 'turn_detection_to_final_event') || 0;
      const s2f = pick(m, 'speaking_to_final_event') || 0;
      const isBargeIn = s2t < 0;
      // merge_count > 1 means multiple utterance segments were combined,
      // so start_timestamp refers to an earlier segment and inflates s2f.
      // merge_count == 1 means the message is a single segment (no merge).
      const multiMerged = (m.merge_count || 0) > 1;
      return {
        index: i,
        confidence: pick(m, 'confidence'),
        text: (typeof m.content === 'string' ? m.content : '').trim(),
        speakingToFinal: Math.max(0, s2f),
        speakingToTurn: Math.max(0, s2t),
        turnToFinal: isBargeIn ? Math.max(0, s2f) : Math.max(0, t2f),
        isBargeIn,
        multiMerged,
      };
    });

  const confidences = perMessage.map(m => m.confidence);

  const bargeInCount = userMessages.reduce((sum, m) => sum + (m.barge_count || 0), 0);
  const bargeInRate = totalUserMessages > 0
    ? bargeInCount / totalUserMessages
    : 0;

  const bargeDepths = userMessages.filter(m => m.barge_count > 0).map(m => m.barge_count);
  const avgBargeInDepth = bargeDepths.length ? mean(bargeDepths) : 0;

  return {
    avgConfidence: mean(confidences),
    confidences,
    perMessage,
    bargeInRate,
    bargeInCount,
    avgBargeInDepth,
    totalUserMessages,
  };
}
