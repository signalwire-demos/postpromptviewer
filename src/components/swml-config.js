export function renderSwmlConfig(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div class="p-6 text-sm opacity-50">No AI configuration found</div>';
    return;
  }

  const params = aiConfig.params || {};
  const hints = aiConfig.hints || [];
  const languages = aiConfig.languages || [];
  const globalData = aiConfig.global_data || {};
  const postPrompt = aiConfig.post_prompt || {};
  const prompt = aiConfig.prompt || {};

  container.innerHTML = `
    <div class="p-6 max-w-6xl mx-auto space-y-6">
      ${Object.keys(params).length > 0 ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between">
              <h3 class="card-title text-base" style="font-family: var(--font-heading)">AI Parameters</h3>
              <button class="btn btn-ghost btn-xs swml-config-copy" data-value="${escapeHtml(JSON.stringify(params, null, 2))}" title="Copy parameters">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <tbody>
                  ${Object.entries(params).map(([key, value]) => `
                    <tr class="hover">
                      <td class="font-mono text-sm font-medium w-48">${escapeHtml(key)}</td>
                      <td class="text-sm opacity-70">${escapeHtml(String(value))}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : ''}

      ${prompt.temperature != null || prompt.top_p != null ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body">
            <h3 class="card-title text-base" style="font-family: var(--font-heading)">Model Parameters</h3>
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <tbody>
                  ${prompt.temperature != null ? `
                    <tr class="hover">
                      <td class="font-mono text-sm font-medium w-48">Temperature</td>
                      <td class="text-sm opacity-70">${prompt.temperature}</td>
                    </tr>
                  ` : ''}
                  ${prompt.top_p != null ? `
                    <tr class="hover">
                      <td class="font-mono text-sm font-medium w-48">Top P</td>
                      <td class="text-sm opacity-70">${prompt.top_p}</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : ''}

      ${languages.length > 0 ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between">
              <h3 class="card-title text-base" style="font-family: var(--font-heading)">Languages</h3>
              <button class="btn btn-ghost btn-xs swml-config-copy" data-value="${escapeHtml(JSON.stringify(languages, null, 2))}" title="Copy languages">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div class="flex flex-wrap gap-3">
              ${languages.map(lang => `
                <div class="flex items-center gap-2 p-2 bg-base-300 rounded-lg">
                  <span class="font-medium text-sm">${escapeHtml(lang.name || 'Unknown')}</span>
                  <div class="badge badge-primary badge-sm">${escapeHtml(lang.code || '')}</div>
                  <div class="badge badge-ghost badge-sm">${escapeHtml(lang.voice || '')}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      ${hints.length > 0 ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="card-title text-base" style="font-family: var(--font-heading)">Speech Hints</h3>
                <div class="badge badge-ghost badge-sm">${hints.length}</div>
              </div>
              <button class="btn btn-ghost btn-xs swml-config-copy" data-value="${escapeHtml(JSON.stringify(hints, null, 2))}" title="Copy hints">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              ${hints.map(hint => `<div class="badge badge-outline badge-sm">${escapeHtml(hint)}</div>`).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      ${Object.keys(globalData).length > 0 ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between">
              <h3 class="card-title text-base" style="font-family: var(--font-heading)">Global Data</h3>
              <button class="btn btn-ghost btn-xs swml-config-copy" data-value="${escapeHtml(JSON.stringify(globalData, null, 2))}" title="Copy global data">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div class="mockup-code bg-base-300 text-sm">
              <pre class="px-6 overflow-x-auto"><code>${escapeHtml(JSON.stringify(globalData, null, 2))}</code></pre>
            </div>
          </div>
        </div>
      ` : ''}

      ${Object.keys(postPrompt).length > 0 ? `
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body">
            <div class="flex items-center justify-between">
              <h3 class="card-title text-base" style="font-family: var(--font-heading)">Post-Prompt Configuration</h3>
              <button class="btn btn-ghost btn-xs swml-config-copy" data-value="${escapeHtml(JSON.stringify(postPrompt, null, 2))}" title="Copy post-prompt config">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            ${postPrompt.text ? `
              <div>
                <div class="text-xs font-medium opacity-50 uppercase mb-1">Text</div>
                <pre class="text-sm bg-base-300 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">${escapeHtml(postPrompt.text)}</pre>
              </div>
            ` : ''}
            ${postPrompt.post_prompt_url ? `
              <div>
                <div class="text-xs font-medium opacity-50 uppercase mb-1">URL</div>
                <div class="text-sm font-mono opacity-70">${escapeHtml(postPrompt.post_prompt_url)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Add copy handlers
  container.querySelectorAll('.swml-config-copy').forEach(btn => {
    btn.addEventListener('click', () => {
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
