export function renderSwmlOverview(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No AI configuration found in SWML</div>';
    return;
  }

  const prompt = aiConfig.prompt || {};
  const contexts = prompt.contexts || {};
  const defaultContext = contexts.default || {};
  const steps = defaultContext.steps || [];
  const swaigFunctions = aiConfig.SWAIG?.functions || [];
  const languages = aiConfig.languages || [];
  const hints = aiConfig.hints || [];
  const globalData = aiConfig.global_data || {};

  const stats = [
    { label: 'SWML Version', value: swml.version || 'N/A' },
    { label: 'Steps Defined', value: steps.length },
    { label: 'SWAIG Functions', value: swaigFunctions.length },
    { label: 'Languages', value: languages.length },
    { label: 'Hints', value: hints.length },
    { label: 'Temperature', value: prompt.temperature ?? 'N/A' },
    { label: 'Top P', value: prompt.top_p ?? 'N/A' },
  ];

  container.innerHTML = `
    <div class="swml-overview">
      <div class="swml-overview__header">
        <h2 style="margin:0;font-size:1.25rem;font-weight:700;color:var(--text-primary)">SWML Configuration Overview</h2>
        <p style="margin:0.5rem 0 0 0;font-size:0.875rem;color:var(--text-secondary)">SignalWire Markup Language AI Agent Configuration</p>
      </div>

      <div class="swml-overview__stats">
        ${stats.map(stat => `
          <div class="swml-stat-card">
            <div class="swml-stat-card__label">${stat.label}</div>
            <div class="swml-stat-card__value">${stat.value}</div>
          </div>
        `).join('')}
      </div>

      ${languages.length > 0 ? `
        <div class="swml-overview__section">
          <h3 class="swml-section-title">Languages</h3>
          <div class="swml-language-list">
            ${languages.map(lang => `
              <div class="swml-language-card">
                <div class="swml-language-card__name">${escapeHtml(lang.name || 'Unknown')}</div>
                <div class="swml-language-card__details">
                  <span class="swml-language-card__code">${escapeHtml(lang.code || '')}</span>
                  <span class="swml-language-card__voice">${escapeHtml(lang.voice || '')}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${Object.keys(globalData).length > 0 ? `
        <div class="swml-overview__section">
          <h3 class="swml-section-title">Global Data Summary</h3>
          <div class="swml-global-data-preview">
            ${Object.entries(globalData).map(([key, value]) => `
              <div class="swml-global-item">
                <span class="swml-global-key">${escapeHtml(key)}</span>
                <span class="swml-global-value">${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="swml-overview__section">
        <h3 class="swml-section-title">Conversation Steps (${steps.length})</h3>
        <p class="swml-section-subtitle">View detailed step instructions and flow diagram in Prompts & Steps tab</p>
        <div class="swml-steps-list">
          ${steps.map((step, idx) => {
            const funcs = normalizeFunctions(step.functions);
            const funcText = funcs.length > 0 ? funcs.join(', ') : 'none';
            return `
              <div class="swml-step-list-item">
                <div class="swml-step-list-number">${idx + 1}.</div>
                <div class="swml-step-list-name">${escapeHtml(step.name || 'Unnamed Step')}</div>
                <div class="swml-step-list-functions">${escapeHtml(funcText)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function normalizeFunctions(functions) {
  if (!functions || functions === 'none') return [];
  if (typeof functions === 'string') return [functions];
  if (Array.isArray(functions)) return functions;
  return [];
}

function getFunctionCount(functions) {
  return normalizeFunctions(functions).length;
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
