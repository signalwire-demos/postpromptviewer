export function renderSwmlOverview(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div class="p-6 text-sm opacity-50">No AI configuration found in SWML</div>';
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
    <div class="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 class="text-xl font-bold" style="font-family: var(--font-heading)">SWML Configuration Overview</h2>
        <p class="text-sm opacity-60 mt-1">SignalWire Markup Language AI Agent Configuration</p>
      </div>

      <div class="stats stats-vertical lg:stats-horizontal shadow w-full bg-base-200">
        ${stats.map(stat => `
          <div class="stat">
            <div class="stat-title">${stat.label}</div>
            <div class="stat-value text-lg">${stat.value}</div>
          </div>
        `).join('')}
      </div>

      ${languages.length > 0 ? `
        <div>
          <h3 class="text-lg font-bold mb-3" style="font-family: var(--font-heading)">Languages</h3>
          <div class="flex flex-wrap gap-3">
            ${languages.map(lang => `
              <div class="card bg-base-200 shadow-sm">
                <div class="card-body p-3">
                  <div class="font-medium text-sm">${escapeHtml(lang.name || 'Unknown')}</div>
                  <div class="flex gap-2">
                    <div class="badge badge-primary badge-sm">${escapeHtml(lang.code || '')}</div>
                    <div class="badge badge-ghost badge-sm">${escapeHtml(lang.voice || '')}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${Object.keys(globalData).length > 0 ? `
        <div>
          <h3 class="text-lg font-bold mb-3" style="font-family: var(--font-heading)">Global Data Summary</h3>
          <div class="overflow-x-auto rounded-box border border-base-300 bg-base-200">
            <table class="table table-sm">
              <thead><tr class="bg-base-300"><th>Key</th><th>Value</th></tr></thead>
              <tbody>
                ${Object.entries(globalData).map(([key, value]) => `
                  <tr class="hover">
                    <td class="font-mono text-sm">${escapeHtml(key)}</td>
                    <td class="text-sm opacity-70">${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div>
        <h3 class="text-lg font-bold mb-3" style="font-family: var(--font-heading)">Conversation Steps (${steps.length})</h3>
        <p class="text-xs opacity-50 mb-3">View detailed step instructions and flow diagram in Prompts & Steps tab</p>
        <div class="overflow-x-auto rounded-box border border-base-300 bg-base-200">
          <table class="table table-sm">
            <thead><tr class="bg-base-300"><th>#</th><th>Step Name</th><th>Functions</th></tr></thead>
            <tbody>
              ${steps.map((step, idx) => {
                const funcs = normalizeFunctions(step.functions);
                const funcText = funcs.length > 0 ? funcs.join(', ') : 'none';
                return `
                  <tr class="hover">
                    <td class="text-sm opacity-60">${idx + 1}</td>
                    <td class="font-medium text-sm">${escapeHtml(step.name || 'Unnamed Step')}</td>
                    <td class="text-sm font-mono opacity-70">${escapeHtml(funcText)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
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
