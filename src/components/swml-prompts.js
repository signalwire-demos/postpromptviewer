import mermaid from 'mermaid';

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#e5e7eb',
    primaryBorderColor: '#60a5fa',
    lineColor: '#6b7280',
    secondaryColor: '#1f2937',
    tertiaryColor: '#111827',
    background: '#0a0a0a',
    mainBkg: '#1f2937',
    secondBkg: '#111827',
    textColor: '#e5e7eb',
    borderColor: '#374151',
    nodeBorder: '#60a5fa',
    clusterBkg: '#1f2937',
    clusterBorder: '#374151',
    edgeLabelBackground: '#1f2937',
  },
  flowchart: {
    curve: 'basis',
    padding: 20,
  },
});

export async function renderSwmlPrompts(container, swml) {
  const aiConfig = findAiConfig(swml);

  if (!aiConfig) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No AI configuration found</div>';
    return;
  }

  const prompt = aiConfig.prompt || {};
  const pom = prompt.pom || [];
  const contexts = prompt.contexts || {};
  const defaultContext = contexts.default || {};
  const contextPom = defaultContext.pom || [];
  const steps = defaultContext.steps || [];

  // Generate mermaid diagram for steps
  const mermaidDef = generateStepFlowDiagram(steps);

  container.innerHTML = `
    <div class="swml-prompts">
      ${steps.length > 0 && !hasEmptyValidSteps(steps) ? `
        <div class="swml-prompts__section">
          <div class="swml-step-flow-header">
            <div>
              <h3 class="swml-section-title">Step Flow Diagram</h3>
              <p class="swml-section-subtitle">Visual representation of the conversation state machine</p>
            </div>
            <div style="display:flex;gap:0.5rem">
              <button id="copy-step-mermaid-btn" class="swml-flow-btn">Copy Mermaid</button>
              <button id="copy-step-svg-btn" class="swml-flow-btn">Copy SVG</button>
            </div>
          </div>
          <div class="swml-step-flow-diagram" id="step-mermaid-container">
            <div class="mermaid">${mermaidDef}</div>
          </div>
        </div>
      ` : ''}
      ${steps.length > 0 && hasEmptyValidSteps(steps) ? `
        <div class="swml-prompts__section">
          <div class="swml-flow-notice swml-flow-notice--large">
            <div class="swml-flow-notice-icon">🔄</div>
            <div>
              <strong>Server-Side State Transitions</strong>
              <p>This SWML configuration uses dynamic transitions controlled by your backend handlers. Step changes are triggered via <code>_change_step</code> in tool function responses rather than being declared in <code>valid_steps</code> arrays.</p>
              <p style="margin-top:0.5rem;font-size:0.85rem;opacity:0.8;">Since the actual flow logic lives in your server code (not in the SWML JSON), no state diagram is shown here. Refer to your backend implementation to see the complete state machine flow.</p>
            </div>
          </div>
        </div>
      ` : ''}

      ${pom.length > 0 ? `
        <div class="swml-prompts__section">
          <h3 class="swml-section-title">Global Prompts</h3>
          <p class="swml-section-subtitle">Top-level prompts applied to all interactions</p>
          ${pom.map((p, idx) => `
            <div class="swml-prompt-card" data-id="global-${idx}">
              <div class="swml-prompt-card__header">
                <span class="swml-prompt-card__title">${escapeHtml(p.title || 'Untitled Prompt')}</span>
                <button class="swml-prompt-copy" data-value="${escapeHtml(p.body || '')}" title="Copy prompt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="swml-prompt-card__body">
                <pre class="swml-prompt-text">${escapeHtml(p.body || '')}</pre>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${contextPom.length > 0 ? `
        <div class="swml-prompts__section">
          <h3 class="swml-section-title">Context Prompts</h3>
          <p class="swml-section-subtitle">Prompts specific to the default context</p>
          ${contextPom.map((p, idx) => `
            <div class="swml-prompt-card" data-id="context-${idx}">
              <div class="swml-prompt-card__header">
                <span class="swml-prompt-card__title">${escapeHtml(p.title || 'Untitled Prompt')}</span>
                <button class="swml-prompt-copy" data-value="${escapeHtml(p.body || '')}" title="Copy prompt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="swml-prompt-card__body">
                <pre class="swml-prompt-text">${escapeHtml(p.body || '')}</pre>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${steps.length > 0 ? `
        <div class="swml-prompts__section">
          <h3 class="swml-section-title">Step Instructions</h3>
          <p class="swml-section-subtitle">Per-step prompts and instructions</p>
          ${steps.map((step, idx) => `
            <div class="swml-step-card" data-step-id="${idx}">
              <div class="swml-step-card__header">
                <div>
                  <span class="swml-step-arrow">&#x25B6;</span>
                  <span class="swml-step-card__name">${escapeHtml(step.name || 'Unnamed Step')}</span>
                  <span class="swml-step-card__badge">${getFunctionCount(step.functions)} functions</span>
                </div>
                <button class="swml-prompt-copy" data-value="${escapeHtml(step.text || '')}" title="Copy step text">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="swml-step-card__body">
                <div class="swml-step-detail">
                  <div class="swml-step-detail__label">Instructions</div>
                  <pre class="swml-prompt-text">${escapeHtml(step.text || '')}</pre>
                </div>
                <div class="swml-step-detail">
                  <div class="swml-step-detail__label">Completion Criteria</div>
                  <div class="swml-step-criteria">${escapeHtml(step.step_criteria || 'None specified')}</div>
                </div>
                ${getFunctionCount(step.functions) > 0 ? `
                  <div class="swml-step-detail">
                    <div class="swml-step-detail__label">Available Functions</div>
                    <div class="swml-step-functions">
                      ${normalizeFunctions(step.functions).map(fn => `<span class="swml-function-tag">${escapeHtml(fn)}</span>`).join('')}
                    </div>
                  </div>
                ` : ''}
                ${step.valid_steps && step.valid_steps.length > 0 ? `
                  <div class="swml-step-detail">
                    <div class="swml-step-detail__label">Valid Next Steps</div>
                    <div class="swml-step-transitions">
                      ${step.valid_steps.map(s => `<span class="swml-step-tag">${escapeHtml(s)}</span>`).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  // Render mermaid diagram (only if transitions exist)
  if (steps.length > 0 && !hasEmptyValidSteps(steps)) {
    try {
      const mermaidElement = container.querySelector('.mermaid');
      await mermaid.run({ nodes: [mermaidElement] });
    } catch (error) {
      console.error('Mermaid rendering error:', error);
      container.querySelector('#step-mermaid-container').innerHTML = `
        <div style="padding:2rem;text-align:center;color:var(--text-muted)">
          <p>Failed to render diagram</p>
          <pre style="margin-top:1rem;text-align:left;font-size:0.7rem;overflow:auto">${escapeHtml(error.message)}</pre>
        </div>
      `;
    }

    // Add copy mermaid button handler
    const copyMermaidBtn = container.querySelector('#copy-step-mermaid-btn');
    copyMermaidBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(mermaidDef).then(() => {
        copyMermaidBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyMermaidBtn.textContent = 'Copy Mermaid';
        }, 2000);
      });
    });

    // Add copy SVG button handler
    const copySvgBtn = container.querySelector('#copy-step-svg-btn');
    copySvgBtn?.addEventListener('click', () => {
      const svg = container.querySelector('#step-mermaid-container svg');
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        navigator.clipboard.writeText(svgData).then(() => {
          copySvgBtn.textContent = 'Copied!';
          setTimeout(() => {
            copySvgBtn.textContent = 'Copy SVG';
          }, 2000);
        });
      }
    });
  }

  // Add copy handlers
  container.querySelectorAll('.swml-prompt-copy').forEach(btn => {
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

  // Add accordion toggles for steps
  container.querySelectorAll('.swml-step-card__header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.swml-prompt-copy')) return;
      const card = header.closest('.swml-step-card');
      card.classList.toggle('open');
    });
  });
}

function generateStepFlowDiagram(steps) {
  if (!steps || steps.length === 0) return '';

  const hasTransitions = steps.some(step => {
    const validSteps = step.valid_steps || [];
    return validSteps.length > 0;
  });

  // If no transitions, use a cleaner flowchart layout
  if (!hasTransitions) {
    return generateStepGridDiagram(steps);
  }

  // Original diagram for when there are actual transitions
  let diagram = 'stateDiagram-v2\n';
  diagram += '    direction TB\n\n';

  if (steps.length > 0) {
    diagram += `    [*] --> ${sanitizeId(steps[0].name)}\n`;
  }

  steps.forEach(step => {
    const stepId = sanitizeId(step.name);
    const stepLabel = step.name.replace(/"/g, '\\"');
    diagram += `    ${stepId}: ${stepLabel}\n`;
  });

  diagram += '\n';

  steps.forEach(step => {
    const stepId = sanitizeId(step.name);
    const validSteps = step.valid_steps || [];

    validSteps.forEach(nextStep => {
      const nextStepId = sanitizeId(nextStep);
      diagram += `    ${stepId} --> ${nextStepId}\n`;
    });

    if (validSteps.length === 0 && steps.indexOf(step) === steps.length - 1) {
      diagram += `    ${stepId} --> [*]\n`;
    }
  });

  diagram += '\n';
  steps.forEach(step => {
    const stepId = sanitizeId(step.name);
    let functions = normalizeFunctions(step.functions);

    if (functions.length > 0) {
      const funcList = functions.join(', ');
      const cleanFuncs = funcList.replace(/"/g, '\\"');
      diagram += `    note right of ${stepId}\n`;
      diagram += `      Functions: ${cleanFuncs}\n`;
      diagram += `    end note\n`;
    }
  });

  return diagram;
}

function generateStepGridDiagram(steps) {
  // Create a cleaner flowchart layout when there are no transitions
  let diagram = 'flowchart TB\n';

  // Group steps into rows of 4
  const stepsPerRow = 4;
  const rows = [];

  for (let i = 0; i < steps.length; i += stepsPerRow) {
    rows.push(steps.slice(i, i + stepsPerRow));
  }

  // Add all nodes with labels
  steps.forEach((step, idx) => {
    const stepId = `step${idx}`;
    const stepLabel = step.name.replace(/"/g, '\\"');
    const functions = normalizeFunctions(step.functions);
    const funcCount = functions.length;
    const funcText = funcCount > 0 ? `<br/><small>${funcCount} functions</small>` : '';

    diagram += `    ${stepId}["<b>${stepLabel}</b>${funcText}"]\n`;
  });

  diagram += '\n';

  // Add invisible connections to arrange in rows
  rows.forEach((row, rowIdx) => {
    row.forEach((step, colIdx) => {
      const currentIdx = rowIdx * stepsPerRow + colIdx;
      const stepId = `step${currentIdx}`;

      // Connect to next in row
      if (colIdx < row.length - 1) {
        const nextId = `step${currentIdx + 1}`;
        diagram += `    ${stepId} ~~~ ${nextId}\n`;
      }
    });

    // Connect rows vertically
    if (rowIdx < rows.length - 1) {
      const lastInRow = `step${(rowIdx + 1) * stepsPerRow - 1}`;
      const firstInNextRow = `step${(rowIdx + 1) * stepsPerRow}`;
      if ((rowIdx + 1) * stepsPerRow < steps.length) {
        diagram += `    ${lastInRow} ~~~ ${firstInNextRow}\n`;
      }
    }
  });

  // Style
  diagram += '\n    classDef stepBox fill:#1f2937,stroke:#60a5fa,stroke-width:2px,color:#e5e7eb\n';
  diagram += `    class ${steps.map((_, i) => `step${i}`).join(',')} stepBox\n`;

  return diagram;
}

function hasEmptyValidSteps(steps) {
  // Check if all steps have empty valid_steps arrays
  return steps.every(step => {
    const validSteps = step.valid_steps || [];
    return validSteps.length === 0;
  });
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

function sanitizeId(name) {
  // Convert step name to valid mermaid ID
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
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
