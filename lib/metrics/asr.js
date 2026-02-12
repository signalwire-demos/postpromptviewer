import { mean } from '../utils.js';

export function computeAsr(data) {
  const userMessages = data.callLog.filter(m => m.role === 'user');
  const totalUserMessages = userMessages.length;

  // Per-message data for charts (confidence + text + ASR timing)
  // Negative speaking_to_turn_detection = barge-in (turn detection fired before
  // this utterance's reference point). Clamp negatives to 0 for charting.
  const perMessage = userMessages
    .filter(m => m.confidence != null)
    .map((m, i) => {
      const s2t = m.speaking_to_turn_detection || 0;
      const t2f = m.turn_detection_to_final_event || 0;
      const s2f = m.speaking_to_final_event || 0;
      const isBargeIn = s2t < 0;
      return {
        index: i,
        confidence: m.confidence,
        text: (typeof m.content === 'string' ? m.content : '').trim(),
        speakingToFinal: Math.max(0, s2f),
        speakingToTurn: Math.max(0, s2t),
        turnToFinal: isBargeIn ? Math.max(0, s2f) : Math.max(0, t2f),
        isBargeIn,
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
