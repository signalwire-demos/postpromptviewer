import { formatDuration, formatTimestamp, truncate } from '../../lib/utils.js';
import { update } from '../state.js';

export function renderHeader(container, payload, metrics) {
  const dur = metrics.duration;
  const durationText = formatDuration(dur.callDuration);

  let endBadge = '';
  if (dur.callInProgress) {
    endBadge = '<span class="header__badge header__badge--in-progress">In Progress</span>';
  } else if (payload.callEndedBy === 'user') {
    endBadge = '<span class="header__badge header__badge--ended-user">Ended by User</span>';
  } else if (payload.callEndedBy === 'assistant') {
    endBadge = '<span class="header__badge header__badge--ended-assistant">Ended by Assistant</span>';
  }

  let hardTimeoutBadge = '';
  if (payload.hardTimeout) {
    hardTimeoutBadge = '<span class="header__badge" style="background:rgba(239,68,68,0.15);color:#ef4444">Hard Timeout</span>';
  }

  const type = payload.swmlCall.type || payload.conversationType || '';
  const direction = payload.swmlCall.direction || '';
  const appName = payload.appName || '';

  let aiResultBadge = '';
  if (payload.swmlVars && payload.swmlVars.ai_result) {
    aiResultBadge = `<span class="header__badge" style="background:rgba(59,130,246,0.15);color:#3b82f6">${payload.swmlVars.ai_result}</span>`;
  }

  let conversationIdHtml = '';
  if (payload.conversationId) {
    conversationIdHtml = `<span title="${payload.conversationId}">Conv: ${truncate(payload.conversationId, 12)}</span>`;
  }

  container.innerHTML = `
    <div class="header">
      <button class="header__back" id="header-back" title="Load another file">&#x2190; New File</button>
      <span class="header__id" id="header-call-id" title="Click to copy full Call ID">
        ${truncate(payload.callId, 12)}
      </span>
      <span class="header__badge header__badge--duration">${durationText}</span>
      ${endBadge}
      ${hardTimeoutBadge}
      ${aiResultBadge}
      <div class="header__meta">
        ${appName ? `<span>${appName}</span>` : ''}
        ${type ? `<span>${type}${direction ? ` / ${direction}` : ''}</span>` : ''}
        <span>${formatTimestamp(payload.callStartTime)}</span>
        ${conversationIdHtml}
      </div>
    </div>
  `;

  document.getElementById('header-call-id').addEventListener('click', () => {
    navigator.clipboard.writeText(payload.callId).then(() => {
      const el = document.getElementById('header-call-id');
      const orig = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(() => { el.textContent = orig; }, 1200);
    });
  });

  document.getElementById('header-back').addEventListener('click', () => {
    update({ payload: null, metrics: null, activeTab: 'dashboard' });
  });
}
