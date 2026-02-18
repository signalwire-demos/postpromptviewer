export function renderSwmlFunctions(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No AI configuration found</div>';
    return;
  }

  const swaigConfig = aiConfig.SWAIG || {};
  const functions = swaigConfig.functions || [];
  const defaults = swaigConfig.defaults || {};

  if (functions.length === 0) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No SWAIG functions defined</div>';
    return;
  }

  container.innerHTML = `
    <div class="swml-functions">
      <div class="swml-functions__header">
        <div>
          <h3 style="margin:0;font-size:0.95rem;font-weight:600;color:var(--text-secondary)">SWAIG Functions</h3>
          <p style="margin:0.25rem 0 0 0;font-size:0.75rem;color:var(--text-muted)">${functions.length} function${functions.length !== 1 ? 's' : ''} defined</p>
        </div>
      </div>

      ${Object.keys(defaults).length > 0 ? `
        <div class="swml-defaults-card">
          <div class="swml-defaults-card__header">
            <span class="swml-defaults-card__title">Default Configuration</span>
          </div>
          <div class="swml-defaults-card__body">
            ${renderDataItems(defaults, 'defaults')}
          </div>
        </div>
      ` : ''}

      <div class="swml-functions-list">
        ${functions.map((fn, idx) => renderFunctionCard(fn, idx)).join('')}
      </div>
    </div>
  `;

  // Add copy handlers
  container.querySelectorAll('.swml-function-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.value;
      navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 2000);
      });
    });
  });

  // Add accordion toggles
  container.querySelectorAll('.swml-function-card__header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.swml-function-copy')) return;
      const card = header.closest('.swml-function-card');
      card.classList.toggle('open');
    });
  });

  // Add nested item toggles
  container.querySelectorAll('.swml-param-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = toggle.closest('.swml-param-item');
      item.classList.toggle('expanded');
    });
  });
}

function renderFunctionCard(fn, idx) {
  const parameters = fn.parameters || {};
  const properties = parameters.properties || {};
  const required = parameters.required || [];

  return `
    <div class="swml-function-card" data-fn-id="${idx}">
      <div class="swml-function-card__header">
        <div>
          <span class="swml-function-arrow">&#x25B6;</span>
          <span class="swml-function-card__name">${escapeHtml(fn.function || 'Unnamed Function')}</span>
          ${required.length > 0 ? `<span class="swml-function-badge">${required.length} required</span>` : ''}
        </div>
        <button class="swml-function-copy" data-value="${escapeHtml(JSON.stringify(fn, null, 2))}" title="Copy function">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      <div class="swml-function-card__body">
        ${fn.description ? `
          <div class="swml-function-detail">
            <div class="swml-function-detail__label">Description</div>
            <div class="swml-function-description">${escapeHtml(fn.description)}</div>
          </div>
        ` : ''}

        ${fn.web_hook_url ? `
          <div class="swml-function-detail">
            <div class="swml-function-detail__label">Webhook URL</div>
            <div class="swml-function-url">${escapeHtml(fn.web_hook_url)}</div>
          </div>
        ` : ''}

        ${fn.wait_file ? `
          <div class="swml-function-detail">
            <div class="swml-function-detail__label">Wait File</div>
            <div class="swml-function-url">${escapeHtml(fn.wait_file)}</div>
          </div>
        ` : ''}

        ${Object.keys(properties).length > 0 ? `
          <div class="swml-function-detail">
            <div class="swml-function-detail__label">Parameters</div>
            <div class="swml-function-params">
              ${Object.entries(properties).map(([key, value]) => renderParameter(key, value, required.includes(key))).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderParameter(key, value, isRequired) {
  const type = value.type || 'any';
  const description = value.description || '';
  const hasNested = typeof value === 'object' && Object.keys(value).length > 2;

  return `
    <div class="swml-param-item ${hasNested ? 'has-nested' : ''}">
      <div class="swml-param-row">
        ${hasNested ? '<span class="swml-param-toggle">&#x25B6;</span>' : '<span class="swml-param-spacer"></span>'}
        <span class="swml-param-name">${escapeHtml(key)}${isRequired ? '<span class="swml-param-required">*</span>' : ''}</span>
        <span class="swml-param-type">${escapeHtml(type)}</span>
        ${description ? `<span class="swml-param-desc">${escapeHtml(description)}</span>` : ''}
      </div>
      ${hasNested ? `
        <div class="swml-param-nested">
          ${renderDataItems(value, `param-${key}`)}
        </div>
      ` : ''}
    </div>
  `;
}

function renderDataItems(data, parentKey = '') {
  if (typeof data !== 'object' || data === null) {
    return `<div class="swml-data-value">${escapeHtml(String(data))}</div>`;
  }

  if (Array.isArray(data)) {
    return `
      <div class="swml-data-items">
        ${data.map((item, idx) => {
          const isObject = typeof item === 'object' && item !== null;
          if (isObject) {
            return `
              <div class="swml-data-item swml-data-item--nested">
                <span class="swml-data-key">[${idx}]</span>
                <div class="swml-data-item-children">${renderDataItems(item, `${parentKey}[${idx}]`)}</div>
              </div>
            `;
          }
          return `
            <div class="swml-data-item">
              <span class="swml-data-key">[${idx}]</span>
              <span class="swml-data-value">${escapeHtml(String(item))}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return `
    <div class="swml-data-items">
      ${Object.entries(data).map(([key, value]) => {
        const isObject = typeof value === 'object' && value !== null;
        const isArr = Array.isArray(value);

        if (isObject) {
          return `
            <div class="swml-data-item swml-data-item--nested">
              <span class="swml-data-key">${escapeHtml(key)}</span>
              <div class="swml-data-item-children">${renderDataItems(value, `${parentKey}.${key}`)}</div>
            </div>
          `;
        }

        return `
          <div class="swml-data-item">
            <span class="swml-data-key">${escapeHtml(key)}</span>
            <span class="swml-data-value">${escapeHtml(String(value))}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function findAiConfig(swml) {
  const mainSection = swml.sections?.main || [];
  for (const item of mainSection) {
    if (item.ai) return item.ai;
  }
  return null;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
