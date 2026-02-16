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
      const commandArg = entry.command_arg || 'null';
      bodyHtml = `
        <div class="swaig-entry__section">
          <div class="swaig-entry__section-header">
            <span class="swaig-entry__section-title">Native Command</span>
            <button class="swaig-entry__copy-btn" data-copy="${escapeHtml(commandArg)}" title="Copy">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swaig-entry__json">${escapeHtml(commandArg)}</div>
        </div>
      `;
    } else {
      const postDataHtml = entry.post_data
        ? `<div class="swaig-entry__section">
            <div class="swaig-entry__section-header">
              <span class="swaig-entry__section-title">Request (post_data)</span>
              <button class="swaig-entry__copy-btn" data-copy="${escapeHtml(formatJson(entry.post_data))}" title="Copy JSON">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            ${renderDataItems(entry.post_data, `swaig-${idx}-req`)}
          </div>` : '';
      const postResponseHtml = entry.post_response
        ? `<div class="swaig-entry__section">
            <div class="swaig-entry__section-header">
              <span class="swaig-entry__section-title">Response (post_response)</span>
              <button class="swaig-entry__copy-btn" data-copy="${escapeHtml(formatJson(entry.post_response))}" title="Copy JSON">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            ${renderDataItems(entry.post_response, `swaig-${idx}-resp`)}
          </div>` : '';
      bodyHtml = postDataHtml + postResponseHtml;
    }

    // Full entry JSON for copy all button
    const fullEntryJson = formatJson(entry);

    return `
      <div class="swaig-entry" id="swaig-${idx}">
        <div class="swaig-entry__header" data-idx="${idx}">
          <div>
            <span class="swaig-entry__arrow">&#x25B6;</span>
            <span class="swaig-entry__name">${escapeHtml(name)}</span>
            ${isNative ? '<span style="font-size:0.7rem;color:var(--text-muted)">(native)</span>' : ''}
            <span class="swaig-entry__time">${time}</span>
          </div>
          <button class="swaig-entry__copy-all" data-copy="${escapeHtml(fullEntryJson)}" title="Copy entire entry">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
        <div class="swaig-entry__body">${bodyHtml}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="swaig-inspector">${entriesHtml}</div>`;

  // Accordion toggle
  container.querySelectorAll('.swaig-entry__header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.swaig-entry__copy-all')) return;
      const entry = document.getElementById(`swaig-${header.dataset.idx}`);
      entry.classList.toggle('open');
    });
  });

  // Copy button handlers
  const addCopyHandler = (selector) => {
    container.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textToCopy = btn.dataset.copy;
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalHtml = btn.innerHTML;
          btn.innerHTML = `
            <svg width="${selector.includes('copy-all') ? '14' : '12'}" height="${selector.includes('copy-all') ? '14' : '12'}" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
          setTimeout(() => {
            btn.innerHTML = originalHtml;
          }, 2000);
        });
      });
    });
  };

  addCopyHandler('.swaig-entry__copy-btn');
  addCopyHandler('.swaig-entry__copy-all');

  // Copy item button handlers
  container.querySelectorAll('.swaig-data-item-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = btn.dataset.value;
      navigator.clipboard.writeText(value).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 2000);
      });
    });
  });

  // Add expand/collapse nested objects
  container.querySelectorAll('.swaig-data-nested-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = toggle.closest('.swaig-data-item');
      item.classList.toggle('expanded');
    });
  });
}

function renderDataItems(data, parentKey = '') {
  if (data === null || data === undefined) {
    return `<div class="swaig-data-items"><div class="swaig-data-value-only">${formatValue(data)}</div></div>`;
  }

  if (Array.isArray(data)) {
    return `
      <div class="swaig-data-items">
        ${data.map((item, idx) => {
          const itemKey = `${parentKey}[${idx}]`;
          return renderDataItem(idx, item, itemKey);
        }).join('')}
      </div>
    `;
  }

  if (typeof data === 'object' && data !== null) {
    return `
      <div class="swaig-data-items">
        ${Object.entries(data).map(([key, value]) => {
          const itemKey = parentKey ? `${parentKey}.${key}` : key;
          return renderDataItem(key, value, itemKey);
        }).join('')}
      </div>
    `;
  }

  return `<div class="swaig-data-items"><div class="swaig-data-value-only">${escapeHtml(formatValue(data))}</div></div>`;
}

function renderDataItem(key, value, fullKey) {
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);
  const displayValue = isObject ? (isArray ? `Array[${value.length}]` : 'Object') : formatValue(value);
  const valueString = JSON.stringify(value, null, 2);

  return `
    <div class="swaig-data-item ${isObject ? 'has-nested' : ''}" data-key="${escapeHtml(fullKey || key)}">
      <div class="swaig-data-item-row">
        ${isObject ? '<span class="swaig-data-nested-toggle">&#x25B6;</span>' : '<span class="swaig-data-item-spacer"></span>'}
        <span class="swaig-data-item-key">${escapeHtml(String(key))}</span>
        <span class="swaig-data-item-value ${isObject ? 'is-object' : ''}">${escapeHtml(displayValue)}</span>
        <button class="swaig-data-item-copy" data-value="${escapeHtml(valueString)}" title="Copy value">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      ${isObject ? `
        <div class="swaig-data-item-nested">
          ${renderDataItems(value, fullKey || key)}
        </div>
      ` : ''}
    </div>
  `;
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  return String(value);
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
