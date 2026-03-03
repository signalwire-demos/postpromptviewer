/**
 * Convert a parsed post-prompt payload into a vCon JSON object.
 * Follows IETF draft-ietf-vcon-vcon-container-03.
 */

function usToRfc3339(us) {
  return new Date(us / 1000).toISOString();
}

export function toVcon(payload) {
  const dialog = [];
  const analysis = [];
  const attachments = [];

  // --- Parties ---
  const parties = [
    {
      tel: payload.callerIdNumber || undefined,
      name: payload.callerIdName || 'Caller',
      role: 'customer',
    },
    {
      name: payload.appName || 'AI Agent',
      role: 'agent',
    },
  ];

  // --- Dialog: Recording ---
  if (payload.recordCallUrl) {
    const rec = {
      type: 'recording',
      start: usToRfc3339(payload.callStartDate),
      parties: [0, 1],
      url: payload.recordCallUrl,
    };
    if (payload.callEndDate && payload.callStartDate) {
      rec.duration = (payload.callEndDate - payload.callStartDate) / 1_000_000;
    }
    dialog.push(rec);
  }

  // --- Dialog: Text entries ---
  let firstTextIndex = -1;
  const transcriptBody = [];

  for (const entry of payload.callLog) {
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;

    if (firstTextIndex === -1) firstTextIndex = dialog.length;

    dialog.push({
      type: 'text',
      start: entry.timestamp ? usToRfc3339(entry.timestamp) : undefined,
      parties: [0, 1],
      originator: entry.role === 'user' ? 0 : 1,
      mediatype: 'text/plain',
      body: entry.content,
      encoding: 'none',
    });

    transcriptBody.push({
      role: entry.role,
      content: entry.content,
      timestamp: entry.timestamp || undefined,
    });
  }

  // --- Analysis: Transcript ---
  if (transcriptBody.length > 0) {
    analysis.push({
      type: 'transcript',
      dialog: firstTextIndex >= 0 ? [firstTextIndex] : [],
      vendor: 'signalwire',
      product: 'ai-agent',
      mediatype: 'application/json',
      encoding: 'json',
      body: transcriptBody,
    });
  }

  // --- Analysis: Summary ---
  const summaryText =
    (payload.postPromptData && payload.postPromptData.raw) ||
    payload.conversationSummary ||
    null;

  if (summaryText) {
    analysis.push({
      type: 'summary',
      vendor: 'signalwire',
      product: 'ai-agent',
      mediatype: 'text/plain',
      body: summaryText,
      encoding: 'none',
    });
  }

  // --- Analysis: Function calls ---
  if (payload.swaigLog && payload.swaigLog.length > 0) {
    analysis.push({
      type: 'function_calls',
      vendor: 'signalwire',
      product: 'ai-agent',
      mediatype: 'application/json',
      encoding: 'json',
      body: payload.swaigLog,
    });
  }

  // --- Attachments: Global data ---
  if (payload.globalData && Object.keys(payload.globalData).length > 0) {
    attachments.push({
      type: 'application_state',
      mediatype: 'application/json',
      body: payload.globalData,
      encoding: 'json',
    });
  }

  // --- Assemble vCon ---
  const vcon = {
    vcon: '0.0.2',
    uuid: payload.callId,
    created_at: usToRfc3339(payload.callStartDate),
    subject: payload.appName || 'SignalWire AI Call',
    parties,
    dialog,
    analysis,
    attachments,
  };

  if (payload.callEndDate) {
    vcon.updated_at = usToRfc3339(payload.callEndDate);
  }

  return vcon;
}
