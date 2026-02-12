import { usToSec } from '../utils.js';

export function computeDuration(data) {
  const callDuration = data.callEndDate
    ? usToSec(data.callEndDate - data.callStartDate)
    : usToSec(data.aiEndDate - data.callStartDate); // fallback when call_end_date=0

  const aiSessionDuration = data.aiEndDate && data.aiStartDate
    ? usToSec(data.aiEndDate - data.aiStartDate)
    : 0;

  const ringTime = data.callAnswerDate
    ? usToSec(data.callAnswerDate - data.callStartDate)
    : 0;

  const aiSetupTime = (data.aiStartDate && data.callAnswerDate)
    ? usToSec(data.aiStartDate - data.callAnswerDate)
    : 0;

  const callInProgress = data.callEndDate === 0;

  return {
    callDuration,
    aiSessionDuration,
    ringTime,
    aiSetupTime,
    callInProgress,
  };
}
