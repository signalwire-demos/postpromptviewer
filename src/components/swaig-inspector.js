export function renderSwaigInspector(container, payload) {
  const entries = payload.swaigLog;

  if (!entries.length) {
    container.innerHTML = '<div class="swaig-inspector"><p style="color:var(--text-muted)">No SWAIG function calls recorded</p></div>';
    return;
  }

  const entriesHtml = entries.map((entry, idx) => {
    const name = entry.command_name || 'unknown';
    const time = entry.epoch_time
      ? new Date(entry.epoch_time * 1000).toLocaleTimeString()
      : '';
    const isNative = entry.native === true;

    let bodyHtml = '';
    if (isNative) {
      bodyHtml = `
        <div class="swaig-entry__section">
          <div class="swaig-entry__section-title">Native Command</div>
          <div class="swaig-entry__json">${escapeHtml(entry.command_arg || 'null')}</div>
        </div>
      `;
    } else {
      const postDataHtml = entry.post_data
        ? `<div class="swaig-entry__section">
            <div class="swaig-entry__section-title">Request (post_data)</div>
            <div class="swaig-entry__json">${escapeHtml(formatJson(entry.post_data))}</div>
          </div>` : '';
      const postResponseHtml = entry.post_response
        ? `<div class="swaig-entry__section">
            <div class="swaig-entry__section-title">Response (post_response)</div>
            <div class="swaig-entry__json">${escapeHtml(formatJson(entry.post_response))}</div>
          </div>` : '';
      bodyHtml = postDataHtml + postResponseHtml;
    }

    return `
      <div class="swaig-entry" id="swaig-${idx}">
        <div class="swaig-entry__header" data-idx="${idx}">
          <span class="swaig-entry__arrow">&#x25B6;</span>
          <span class="swaig-entry__name">${escapeHtml(name)}</span>
          ${isNative ? '<span style="font-size:0.7rem;color:var(--text-muted)">(native)</span>' : ''}
          <span class="swaig-entry__time">${time}</span>
        </div>
        <div class="swaig-entry__body">${bodyHtml}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="swaig-inspector">${entriesHtml}</div>`;

  // Accordion toggle
  container.querySelectorAll('.swaig-entry__header').forEach(header => {
    header.addEventListener('click', () => {
      const entry = document.getElementById(`swaig-${header.dataset.idx}`);
      entry.classList.toggle('open');
    });
  });
}

function formatJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
