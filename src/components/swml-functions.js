export function renderSwmlFunctions(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div class="p-6 text-sm opacity-50">No AI configuration found</div>';
    return;
  }

  const swaigConfig = aiConfig.SWAIG || {};
  const functions = swaigConfig.functions || [];
  const defaults = swaigConfig.defaults || {};

  if (functions.length === 0) {
    container.innerHTML = '<div class="p-6 text-sm opacity-50">No SWAIG functions defined</div>';
    return;
  }

  container.innerHTML = `
    <div class="p-6 max-w-6xl mx-auto space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-bold" style="font-family: var(--font-heading)">SWAIG Functions</h3>
          <p class="text-xs opacity-50 mt-1">${functions.length} function${functions.length !== 1 ? 's' : ''} defined</p>
        </div>
      </div>

      ${Object.keys(defaults).length > 0 ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body p-4">
            <h4 class="text-sm font-semibold opacity-60">Default Configuration</h4>
            ${renderDataItems(defaults, 'defaults')}
          </div>
        </div>
      ` : ''}

      <div class="space-y-2">
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
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
    <div class="swml-function-card card bg-base-200 shadow-sm" data-fn-id="${idx}">
      <div class="swml-function-card__header card-body p-4 cursor-pointer flex-row items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="swml-function-arrow text-xs opacity-50">&#x25B6;</span>
          <span class="font-mono font-medium text-sm">${escapeHtml(fn.function || 'Unnamed Function')}</span>
          ${required.length > 0 ? `<div class="badge badge-primary badge-xs">${required.length} required</div>` : ''}
        </div>
        <button class="swml-function-copy btn btn-ghost btn-xs" data-value="${escapeHtml(JSON.stringify(fn, null, 2))}" title="Copy function">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      <div class="swml-function-card__body">
        ${fn.description ? `
          <div class="mb-3">
            <div class="text-xs font-medium opacity-50 uppercase mb-1">Description</div>
            <div class="text-sm">${escapeHtml(fn.description)}</div>
          </div>
        ` : ''}

        ${fn.web_hook_url ? `
          <div class="mb-3">
            <div class="text-xs font-medium opacity-50 uppercase mb-1">Webhook URL</div>
            <div class="text-sm font-mono opacity-70 break-all">${escapeHtml(fn.web_hook_url)}</div>
          </div>
        ` : ''}

        ${fn.wait_file ? `
          <div class="mb-3">
            <div class="text-xs font-medium opacity-50 uppercase mb-1">Wait File</div>
            <div class="text-sm font-mono opacity-70 break-all">${escapeHtml(fn.wait_file)}</div>
          </div>
        ` : ''}

        ${Object.keys(properties).length > 0 ? `
          <div>
            <div class="text-xs font-medium opacity-50 uppercase mb-2">Parameters</div>
            <div class="overflow-x-auto rounded-box border border-base-300">
              <table class="table table-xs">
                <thead><tr class="bg-base-300"><th>Name</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  ${Object.entries(properties).map(([key, value]) => `
                    <tr class="hover">
                      <td class="font-mono text-sm">${escapeHtml(key)}${required.includes(key) ? '<span class="text-error">*</span>' : ''}</td>
                      <td class="text-xs"><div class="badge badge-ghost badge-xs">${escapeHtml(value.type || 'any')}</div></td>
                      <td class="text-xs opacity-70">${escapeHtml(value.description || '')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderDataItems(data, parentKey = '') {
  if (typeof data !== 'object' || data === null) {
    return `<div class="text-sm font-mono opacity-70">${escapeHtml(String(data))}</div>`;
  }

  if (Array.isArray(data)) {
    return `
      <div class="space-y-1">
        ${data.map((item, idx) => {
          const isObject = typeof item === 'object' && item !== null;
          if (isObject) {
            return `
              <div class="ml-3">
                <span class="text-xs font-mono opacity-50">[${idx}]</span>
                ${renderDataItems(item, `${parentKey}[${idx}]`)}
              </div>
            `;
          }
          return `
            <div class="flex gap-2">
              <span class="text-xs font-mono opacity-50">[${idx}]</span>
              <span class="text-sm">${escapeHtml(String(item))}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return `
    <div class="space-y-1">
      ${Object.entries(data).map(([key, value]) => {
        const isObject = typeof value === 'object' && value !== null;

        if (isObject) {
          return `
            <div class="ml-3">
              <span class="text-xs font-mono font-medium">${escapeHtml(key)}</span>
              ${renderDataItems(value, `${parentKey}.${key}`)}
            </div>
          `;
        }

        return `
          <div class="flex gap-2">
            <span class="text-xs font-mono font-medium">${escapeHtml(key)}</span>
            <span class="text-sm opacity-70">${escapeHtml(String(value))}</span>
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
