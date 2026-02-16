import { epochToDate, formatTimestamp, truncate } from '../../lib/utils.js';

const LONG_CONTENT_THRESHOLD = 200;

export function renderTranscript(container, payload) {
  let activeLog = 'processed';

  function buildMessagesHtml(messages) {
    return messages.map((msg, idx) => {
      const role = msg.role || 'unknown';
      const roleClass = role.replace(/[^a-z-]/g, '');
      const isLong = msg.content && msg.content.length > LONG_CONTENT_THRESHOLD;
      const time = msg.timestamp ? formatTimestamp(epochToDate(msg.timestamp)) : '';
      const contentDisplay = msg.content || '';

      // Metadata tags
      const metaTags = [];
      if (msg.latency != null) metaTags.push(`latency: ${msg.latency}ms`);
      if (msg.audio_latency != null) metaTags.push(`audio: ${msg.audio_latency}ms`);
      if (msg.utterance_latency != null) metaTags.push(`utterance: ${msg.utterance_latency}ms`);
      if (msg.confidence != null) metaTags.push(`confidence: ${(msg.confidence * 100).toFixed(1)}%`);
      if (msg.content_type) metaTags.push(msg.content_type);
      if (msg.barge_count) metaTags.push({ text: `🔴 barge-in ×${msg.barge_count}`, class: 'barge' });
      if (msg.merge_count) metaTags.push({ text: `🔀 merged ×${msg.merge_count}`, class: 'merge' });
      if (msg.merged && !msg.merge_count) metaTags.push({ text: '🔀 merged', class: 'merge' });
      if (msg.execution_latency != null) metaTags.push(`exec: ${msg.execution_latency}ms`);
      if (msg.speaking_to_final_event != null) metaTags.push(`speak-to-final: ${msg.speaking_to_final_event}ms`);

      // Tool calls
      let toolCallsHtml = '';
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        toolCallsHtml = msg.tool_calls.map(tc => {
          const fn = tc.function;
          return `<div class="transcript__tool-calls">${fn.name}(${fn.arguments})</div>`;
        }).join('');
      }

      return `
        <div class="transcript__msg transcript__msg--${roleClass}">
          <div class="transcript__role">${role}</div>
          <div class="transcript__body">
            <div class="transcript__content${isLong ? ' transcript__content--truncated' : ''}" id="msg-content-${idx}">
              ${escapeHtml(contentDisplay)}
            </div>
            ${isLong ? `<button class="transcript__toggle" data-idx="${idx}">Show more</button>` : ''}
            ${toolCallsHtml}
            ${metaTags.length > 0 ? `
              <div class="transcript__meta">
                ${metaTags.map(t => {
                  if (typeof t === 'object') {
                    return `<span class="transcript__meta-tag transcript__meta-tag--${t.class}">${t.text}</span>`;
                  }
                  return `<span class="transcript__meta-tag">${t}</span>`;
                }).join('')}
                ${time ? `<span class="transcript__meta-tag">${time}</span>` : ''}
              </div>
            ` : (time ? `<div class="transcript__meta"><span class="transcript__meta-tag">${time}</span></div>` : '')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderLog() {
    const messages = activeLog === 'processed' ? payload.callLog : (payload.rawCallLog || payload.callLog);
    const hasRawLog = !!payload.rawCallLog;

    const toggleStyle = 'padding:0.5rem 1rem;font-size:0.8rem;font-weight:500;cursor:pointer;border:none;background:none;color:var(--text-muted);border-bottom:2px solid transparent;transition:color 0.15s,border-color 0.15s';
    const activeStyle = 'padding:0.5rem 1rem;font-size:0.8rem;font-weight:500;cursor:pointer;border:none;background:none;color:var(--text-primary);border-bottom:2px solid var(--accent)';

    container.innerHTML = `
      <div class="transcript">
        ${hasRawLog ? `
          <div style="display:flex;gap:0;margin-bottom:1rem;border-bottom:1px solid var(--border)">
            <button class="transcript__log-toggle" data-log="processed" style="${activeLog === 'processed' ? activeStyle : toggleStyle}">Processed Log</button>
            <button class="transcript__log-toggle" data-log="raw" style="${activeLog === 'raw' ? activeStyle : toggleStyle}">Raw Log</button>
          </div>
        ` : ''}
        ${buildMessagesHtml(messages)}
      </div>
    `;

    // Toggle handlers for log switching
    container.querySelectorAll('.transcript__log-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLog = btn.dataset.log;
        renderLog();
      });
    });

    // Toggle handlers for show more/less
    container.querySelectorAll('.transcript__toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.idx;
        const content = document.getElementById(`msg-content-${idx}`);
        const isTruncated = content.classList.contains('transcript__content--truncated');
        content.classList.toggle('transcript__content--truncated');
        btn.textContent = isTruncated ? 'Show less' : 'Show more';
      });
    });
  }

  renderLog();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
