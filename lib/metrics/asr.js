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
        timingsInferred: !!m.timings_inferred,
        speaker: m.speaker ?? null,
        // mod_deepgram turn telemetry — present only when the engine
        // enriched the final (absent on DTMF / injected / older engines)
        entity: pick(m, 'entity') ?? null,
        eot: pick(m, 'eot') ?? null,
        timing: pick(m, 'timing') ?? null,
      };
    });

  const confidences = perMessage.map(m => m.confidence);

  const bargeInCount = userMessages.reduce((sum, m) => sum + (m.barge_count || 0), 0);
  const bargeInRate = totalUserMessages > 0
    ? bargeInCount / totalUserMessages
    : 0;

  const bargeDepths = userMessages.filter(m => m.barge_count > 0).map(m => m.barge_count);
  const avgBargeInDepth = bargeDepths.length ? mean(bargeDepths) : 0;

  // Entity captures: entity present ⇒ a complete structured value was
  // recognized; read entity.value (the canonical form) back, not raw ASR.
  const entities = perMessage
    .filter(m => m.entity && m.entity.value)
    .map(m => ({
      type: m.entity.type,
      value: m.entity.value,
      valid: !!m.entity.valid,
      text: m.text,
    }));

  // End-of-turn quality: basis "ceiling" = force-released at the hold cap
  // (low confidence — worth re-prompting); low eot confidence is also flagged.
  const eotBasisCounts = {};
  let ceilingCount = 0;
  const eotConfidences = [];
  for (const m of perMessage) {
    if (!m.eot || !m.eot.basis) continue;
    eotBasisCounts[m.eot.basis] = (eotBasisCounts[m.eot.basis] || 0) + 1;
    if (m.eot.basis === 'ceiling') ceilingCount++;
    if (m.eot.confidence != null) eotConfidences.push(m.eot.confidence);
  }

  // Hold/commit observability. commit_latency_ms is the authoritative
  // "how long EOT held this turn"; walkbacks counts retracted end-of-turn
  // decisions (decision churn, distinct from segments/hold duration).
  const commitLatencies = [];
  let heldTurnCount = 0;
  let multiSegmentCount = 0;
  let totalWalkbacks = 0;
  for (const m of perMessage) {
    if (!m.timing) continue;
    if (m.timing.commit_latency_ms != null) commitLatencies.push(m.timing.commit_latency_ms);
    if ((m.timing.hold_ms || 0) > 0) heldTurnCount++;
    if ((m.timing.segments || 0) > 1) multiSegmentCount++;
    totalWalkbacks += m.timing.walkbacks || 0;
  }

  return {
    avgConfidence: mean(confidences),
    confidences,
    perMessage,
    bargeInRate,
    bargeInCount,
    avgBargeInDepth,
    totalUserMessages,
    entities,
    eotBasisCounts,
    ceilingCount,
    avgEotConfidence: eotConfidences.length ? mean(eotConfidences) : null,
    avgCommitLatencyMs: commitLatencies.length ? mean(commitLatencies) : null,
    heldTurnCount,
    multiSegmentCount,
    totalWalkbacks,
    hasTurnTelemetry: perMessage.some(m => m.entity || m.eot || m.timing),
  };
}
