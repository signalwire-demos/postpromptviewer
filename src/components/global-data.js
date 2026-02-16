export function renderGlobalData(container, payload) {
  const sections = [];

  // 1. Global Data section
  if (payload.globalData && Object.keys(payload.globalData).length > 0) {
    sections.push({
      title: 'Global Data',
      subtitle: 'Session state at end of call (mutated by SWAIG set_global_data actions)',
      data: payload.globalData,
    });
  }

  // 2. User Variables section (from SWMLVars.userVariables)
  const userVars = payload.swmlVars?.userVariables;
  if (userVars && Object.keys(userVars).length > 0) {
    sections.push({
      title: 'User Variables',
      subtitle: 'Client-provided context from SDK connection',
      data: userVars,
    });
  }

  // 3. SWMLVars section (without userVariables, show remaining fields)
  if (payload.swmlVars && Object.keys(payload.swmlVars).length > 0) {
    const { userVariables, ...rest } = payload.swmlVars;
    if (Object.keys(rest).length > 0) {
      sections.push({
        title: 'SWML Variables',
        subtitle: 'Runtime call variables (ai_result, recording, etc.)',
        data: rest,
      });
    }
  }

  // 4. SWMLCall metadata
  if (payload.swmlCall && Object.keys(payload.swmlCall).length > 0) {
    sections.push({
      title: 'Call Metadata',
      subtitle: 'SWMLCall signaling-layer data',
      data: payload.swmlCall,
    });
  }

  // 5. Params (if present)
  if (payload.params && Object.keys(payload.params).length > 0) {
    sections.push({
      title: 'Parameters',
      subtitle: 'Application parameters passed to AI session',
      data: payload.params,
    });
  }

  // 6. Previous Contexts (if present)
  if (payload.previousContexts && payload.previousContexts.length > 0) {
    sections.push({
      title: 'Previous Contexts',
      subtitle: 'Context from prior interactions',
      data: payload.previousContexts,
    });
  }

  // 7. Prompt Vars (if present)
  if (payload.promptVars && Object.keys(payload.promptVars).length > 0) {
    sections.push({
      title: 'Prompt Variables',
      subtitle: 'Template variables active during session',
      data: payload.promptVars,
    });
  }

  if (sections.length === 0) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No session data available</div>';
    return;
  }

  container.innerHTML = `
    <div class="global-data-viewer">
      ${sections.map((section, sectionIdx) => `
        <div class="global-data-section" data-section-id="${sectionIdx}">
          <div class="global-data-header">
            <div>
              <span class="global-data-arrow">&#x25B6;</span>
              <span class="global-data-title">${escapeHtml(section.title)}</span>
              <span class="global-data-subtitle">${escapeHtml(section.subtitle)}</span>
            </div>
            <button class="global-data-copy" data-section-id="${sectionIdx}" title="Copy entire section">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="global-data-body">
            ${renderDataItems(section.data, sectionIdx)}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Add accordion toggle
  container.querySelectorAll('.global-data-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.global-data-copy')) return;
      const section = header.closest('.global-data-section');
      section.classList.toggle('open');
    });
  });

  // Add copy section button handlers
  container.querySelectorAll('.global-data-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sectionId = parseInt(btn.dataset.sectionId);
      const section = sections[sectionId];
      const jsonString = JSON.stringify(section.data, null, 2);

      navigator.clipboard.writeText(jsonString).then(() => {
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          `;
        }, 2000);
      });
    });
  });

  // Add copy item button handlers
  container.querySelectorAll('.global-data-item-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      navigator.clipboard.writeText(value).then(() => {
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"></path>
            </svg>
          `;
        }, 2000);
      });
    });
  });

  // Add expand/collapse nested objects
  container.querySelectorAll('.global-data-nested-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const item = toggle.closest('.global-data-item');
      item.classList.toggle('expanded');
    });
  });
}

function renderDataItems(data, sectionIdx, parentKey = '') {
  if (Array.isArray(data)) {
    return `
      <div class="global-data-items">
        ${data.map((item, idx) => {
          const itemKey = `${parentKey}[${idx}]`;
          return renderDataItem(itemKey, item, sectionIdx);
        }).join('')}
      </div>
    `;
  }

  if (typeof data === 'object' && data !== null) {
    return `
      <div class="global-data-items">
        ${Object.entries(data).map(([key, value]) => {
          const itemKey = parentKey ? `${parentKey}.${key}` : key;
          return renderDataItem(key, value, sectionIdx, itemKey);
        }).join('')}
      </div>
    `;
  }

  return `<div class="global-data-items"><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre></div>`;
}

function renderDataItem(key, value, sectionIdx, fullKey) {
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);
  const displayValue = isObject ? (isArray ? `Array[${value.length}]` : 'Object') : formatValue(value);
  const valueString = JSON.stringify(value, null, 2);

  return `
    <div class="global-data-item ${isObject ? 'has-nested' : ''}" data-key="${escapeHtml(fullKey || key)}">
      <div class="global-data-item-row">
        ${isObject ? '<span class="global-data-nested-toggle">&#x25B6;</span>' : '<span class="global-data-item-spacer"></span>'}
        <span class="global-data-item-key">${escapeHtml(key)}</span>
        <span class="global-data-item-value ${isObject ? 'is-object' : ''}">${escapeHtml(displayValue)}</span>
        <button class="global-data-item-copy" data-value="${escapeHtml(valueString)}" title="Copy value">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      ${isObject ? `
        <div class="global-data-item-nested">
          ${renderDataItems(value, sectionIdx, fullKey || key)}
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
