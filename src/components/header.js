import { formatDuration, formatTimestamp, truncate } from '../../lib/utils.js';
import { toVcon } from '../../lib/vcon.js';
import { getState, update } from '../state.js';
import { uploadRecord } from '../api.js';

export function renderHeader(container, payload, metrics) {
  const dur = metrics.duration;
  const durationText = formatDuration(dur.callDuration);
  const { showRedacted, recordSource } = getState();

  let endBadge = '';
  if (dur.callInProgress) {
    endBadge = '<div class="badge badge-info badge-sm gap-1">In Progress</div>';
  } else if (payload.callEndedBy === 'user') {
    endBadge = '<div class="badge badge-success badge-sm gap-1">Ended by User</div>';
  } else if (payload.callEndedBy === 'assistant') {
    endBadge = '<div class="badge badge-warning badge-sm gap-1">Ended by Assistant</div>';
  }

  let hardTimeoutBadge = '';
  if (payload.hardTimeout) {
    hardTimeoutBadge = '<div class="badge badge-error badge-sm gap-1">Hard Timeout</div>';
  }

  const type = payload.swmlCall.type || payload.conversationType || '';
  const direction = payload.swmlCall.direction || '';
  const appName = payload.appName || '';

  let aiResultBadge = '';
  if (payload.swmlVars && payload.swmlVars.ai_result) {
    aiResultBadge = `<div class="badge badge-primary badge-outline badge-sm">${payload.swmlVars.ai_result}</div>`;
  }

  let conversationIdHtml = '';
  if (payload.conversationId) {
    conversationIdHtml = `<span class="text-xs opacity-60" title="${payload.conversationId}">Conv: ${truncate(payload.conversationId, 12)}</span>`;
  }

  const hasRedacted = (payload.callLog || []).some(e => e.redacted);
  const backLabel = recordSource === 'database' ? '&#x2190; Records' : '&#x2190; New File';
  const showSaveBtn = recordSource !== 'database';

  container.innerHTML = `
    <div class="navbar bg-base-200 border-b border-base-300 px-4 gap-2 flex-wrap min-h-fit py-2">
      <div class="flex items-center gap-2 flex-wrap">
        <button class="btn btn-ghost btn-sm" id="header-back">${backLabel}</button>
        <div class="badge badge-ghost font-mono text-xs cursor-pointer" id="header-call-id" title="Click to copy full Call ID">
          ${truncate(payload.callId, 12)}
        </div>
        <div class="badge badge-primary badge-sm">${durationText}</div>
        ${endBadge}
        ${hardTimeoutBadge}
        ${aiResultBadge}
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button class="btn btn-outline btn-primary btn-xs gap-1" id="header-vcon-btn" title="Download as vCon JSON">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          vCon
        </button>
        ${showSaveBtn ? `
          <button class="btn btn-outline btn-xs gap-1" id="header-save-db-btn" title="Save to P.I.E. database">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" /></svg>
            Save to DB
          </button>
        ` : ''}
        ${hasRedacted ? `<button class="btn btn-xs ${showRedacted ? 'btn-secondary' : 'btn-ghost border border-base-300'}" id="header-redact-btn">${showRedacted ? 'Show Full' : 'Show Redacted'}</button>` : ''}
      </div>
      <div class="flex items-center gap-3 ml-auto text-xs opacity-60 flex-wrap">
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
    if (recordSource === 'database') {
      update({ payload: null, metrics: null, activeTab: 'dashboard', browseMode: true, recordSource: null });
    } else {
      update({ payload: null, metrics: null, activeTab: 'dashboard', recordSource: null });
    }
  });

  const vconBtn = document.getElementById('header-vcon-btn');
  vconBtn.addEventListener('click', () => {
    const vcon = toVcon(payload);
    const blob = new Blob([JSON.stringify(vcon, null, 2)], { type: 'application/vcon+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.callId}.vcon.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    vconBtn.textContent = 'Downloaded!';
    setTimeout(() => { vconBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> vCon'; }, 2000);
  });

  // Save to DB button
  const saveBtn = document.getElementById('header-save-db-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        saveBtn.classList.add('loading');
        await uploadRecord(getState().rawPayload || payload);
        saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Saved!';
        saveBtn.classList.remove('loading');
        saveBtn.classList.add('btn-success');
        setTimeout(() => {
          saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" /></svg> Save to DB';
          saveBtn.classList.remove('btn-success');
        }, 2000);
      } catch (err) {
        saveBtn.textContent = err.message.includes('409') ? 'Already saved' : 'Error';
        saveBtn.classList.remove('loading');
        setTimeout(() => {
          saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" /></svg> Save to DB';
        }, 2000);
      }
    });
  }

  const redactBtn = document.getElementById('header-redact-btn');
  if (redactBtn) {
    redactBtn.addEventListener('click', () => {
      const current = getState().showRedacted;
      update({ showRedacted: !current });
      redactBtn.textContent = !current ? 'Show Full' : 'Show Redacted';
      redactBtn.className = `btn btn-xs ${!current ? 'btn-secondary' : 'btn-ghost border border-base-300'}`;
    });
  }
}
