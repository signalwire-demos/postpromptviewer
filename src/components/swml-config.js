export function renderSwmlConfig(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No AI configuration found</div>';
    return;
  }

  const params = aiConfig.params || {};
  const hints = aiConfig.hints || [];
  const languages = aiConfig.languages || [];
  const globalData = aiConfig.global_data || {};
  const postPrompt = aiConfig.post_prompt || {};
  const prompt = aiConfig.prompt || {};

  container.innerHTML = `
    <div class="swml-config">
      ${Object.keys(params).length > 0 ? `
        <div class="swml-config-section">
          <div class="swml-config-header">
            <h3 class="swml-section-title">AI Parameters</h3>
            <button class="swml-config-copy" data-value="${escapeHtml(JSON.stringify(params, null, 2))}" title="Copy parameters">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swml-config-items">
            ${Object.entries(params).map(([key, value]) => `
              <div class="swml-config-item">
                <span class="swml-config-key">${escapeHtml(key)}</span>
                <span class="swml-config-value">${escapeHtml(String(value))}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${prompt.temperature != null || prompt.top_p != null ? `
        <div class="swml-config-section">
          <h3 class="swml-section-title">Model Parameters</h3>
          <div class="swml-config-items">
            ${prompt.temperature != null ? `
              <div class="swml-config-item">
                <span class="swml-config-key">Temperature</span>
                <span class="swml-config-value">${prompt.temperature}</span>
              </div>
            ` : ''}
            ${prompt.top_p != null ? `
              <div class="swml-config-item">
                <span class="swml-config-key">Top P</span>
                <span class="swml-config-value">${prompt.top_p}</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      ${languages.length > 0 ? `
        <div class="swml-config-section">
          <div class="swml-config-header">
            <h3 class="swml-section-title">Languages</h3>
            <button class="swml-config-copy" data-value="${escapeHtml(JSON.stringify(languages, null, 2))}" title="Copy languages">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swml-language-grid">
            ${languages.map(lang => `
              <div class="swml-language-item">
                <div class="swml-language-name">${escapeHtml(lang.name || 'Unknown')}</div>
                <div class="swml-language-details">
                  <span class="swml-language-code">${escapeHtml(lang.code || '')}</span>
                  <span class="swml-language-voice">${escapeHtml(lang.voice || '')}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${hints.length > 0 ? `
        <div class="swml-config-section">
          <div class="swml-config-header">
            <h3 class="swml-section-title">Speech Hints</h3>
            <span class="swml-section-count">${hints.length} hints</span>
            <button class="swml-config-copy" data-value="${escapeHtml(JSON.stringify(hints, null, 2))}" title="Copy hints">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swml-hints-grid">
            ${hints.map(hint => `<span class="swml-hint-tag">${escapeHtml(hint)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${Object.keys(globalData).length > 0 ? `
        <div class="swml-config-section">
          <div class="swml-config-header">
            <h3 class="swml-section-title">Global Data</h3>
            <button class="swml-config-copy" data-value="${escapeHtml(JSON.stringify(globalData, null, 2))}" title="Copy global data">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swml-global-data-card">
            ${renderNestedData(globalData)}
          </div>
        </div>
      ` : ''}

      ${Object.keys(postPrompt).length > 0 ? `
        <div class="swml-config-section">
          <div class="swml-config-header">
            <h3 class="swml-section-title">Post-Prompt Configuration</h3>
            <button class="swml-config-copy" data-value="${escapeHtml(JSON.stringify(postPrompt, null, 2))}" title="Copy post-prompt config">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swml-config-items">
            ${postPrompt.text ? `
              <div class="swml-config-item swml-config-item--full">
                <span class="swml-config-key">Text</span>
                <pre class="swml-config-value-long">${escapeHtml(postPrompt.text)}</pre>
              </div>
            ` : ''}
            ${postPrompt.post_prompt_url ? `
              <div class="swml-config-item swml-config-item--full">
                <span class="swml-config-key">URL</span>
                <span class="swml-config-value">${escapeHtml(postPrompt.post_prompt_url)}</span>
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
}

function renderNestedData(data, level = 0) {
  if (typeof data !== 'object' || data === null) {
    return `<div class="swml-data-value">${escapeHtml(String(data))}</div>`;
  }

  if (Array.isArray(data)) {
    return `
      <div class="swml-data-array">
        ${data.map((item, idx) => `
          <div class="swml-data-array-item">
            <span class="swml-data-array-idx">[${idx}]</span>
            ${renderNestedData(item, level + 1)}
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="swml-data-object" style="margin-left:${level * 1}rem">
      ${Object.entries(data).map(([key, value]) => {
        const isObject = typeof value === 'object' && value !== null;
        return `
          <div class="swml-data-row">
            <span class="swml-data-key">${escapeHtml(key)}</span>
            ${isObject ? renderNestedData(value, level + 1) : `<span class="swml-data-value">${escapeHtml(String(value))}</span>`}
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
