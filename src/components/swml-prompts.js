import mermaid from 'mermaid';

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#e5e7eb',
    primaryBorderColor: '#60a5fa',
    lineColor: '#9ca3af',
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
    useMaxWidth: false,
    defaultRenderer: 'dagre',
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
      ${steps.length > 0 ? `
        <div class="swml-prompts__section">
          <div class="swml-step-flow-header">
            <div>
              <h3 class="swml-section-title">Step Flow Diagram</h3>
              <p class="swml-section-subtitle">Visual representation of the conversation state machine</p>
            </div>
            <div style="display:flex;gap:0.5rem">
              <button id="copy-step-mermaid-btn" class="swml-flow-btn">Copy Mermaid</button>
              <button id="copy-step-svg-btn" class="swml-flow-btn">Copy SVG</button>
              <button id="download-step-image-btn" class="swml-flow-btn">Download Image</button>
            </div>
          </div>
          <div class="swml-step-flow-diagram-wrapper">
            <div class="swml-zoom-controls">
              <button class="zoom-btn" id="swml-zoom-in" title="Zoom In">+</button>
              <button class="zoom-btn" id="swml-zoom-out" title="Zoom Out">−</button>
              <button class="zoom-btn" id="swml-zoom-reset" title="Reset Zoom">⊙</button>
            </div>
            <div class="swml-step-flow-diagram" id="step-mermaid-container">
              <div class="mermaid">${mermaidDef}</div>
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
                <button class="swml-prompt-copy" data-value="${escapeHtml(getPromptCopyValue(p))}" title="Copy prompt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="swml-prompt-card__body">
                ${renderPromptContent(p)}
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
                <button class="swml-prompt-copy" data-value="${escapeHtml(getPromptCopyValue(p))}" title="Copy prompt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="swml-prompt-card__body">
                ${renderPromptContent(p)}
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

  // Render mermaid diagram
  if (steps.length > 0) {
    try {
      const mermaidElement = container.querySelector('.mermaid');
      await mermaid.run({ nodes: [mermaidElement] });

      // Add zoom/pan functionality
      const svg = container.querySelector('#step-mermaid-container svg');
      if (svg) {
        setupSwmlZoomPan(svg, container);
        makeSwmlEdgesClickable(svg);
      }
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

    // Add download image button handler
    const downloadImageBtn = container.querySelector('#download-step-image-btn');
    downloadImageBtn?.addEventListener('click', async () => {
      const svg = container.querySelector('#step-mermaid-container svg');
      if (svg) {
        try {
          await downloadSvgAsImage(svg, 'swml-step-flow-diagram.png');
          downloadImageBtn.textContent = 'Downloaded!';
          setTimeout(() => {
            downloadImageBtn.textContent = 'Download Image';
          }, 2000);
        } catch (error) {
          console.error('Failed to download image:', error);
          downloadImageBtn.textContent = 'Failed';
          setTimeout(() => {
            downloadImageBtn.textContent = 'Download Image';
          }, 2000);
        }
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

  let lines = ['graph LR'];
  lines.push('    classDef stepNode fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff');
  lines.push('    classDef funcNode fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#000');
  lines.push('    classDef gatherNode fill:#6b7280,stroke:#4b5563,stroke-width:2px,color:#fff');
  lines.push('');

  let nodeId = 0;
  const stepNodes = {};

  // Create all step nodes
  steps.forEach(step => {
    const stepNodeId = `S${nodeId++}`;
    stepNodes[step.name] = stepNodeId;
    const safeLabel = sanitizeSwmlLabel(step.name);
    lines.push(`    ${stepNodeId}["${safeLabel}"]:::stepNode`);
  });

  lines.push('');

  // Draw step→step transitions via valid_steps
  steps.forEach(step => {
    const fromNodeId = stepNodes[step.name];
    const validSteps = step.valid_steps || [];
    validSteps.forEach(nextStepName => {
      const toNodeId = stepNodes[nextStepName];
      if (fromNodeId && toNodeId) {
        lines.push(`    ${fromNodeId} --> ${toNodeId}`);
      }
    });
  });

  lines.push('');

  // Add function nodes attached to each step via dotted arrows
  steps.forEach(step => {
    const stepNodeId = stepNodes[step.name];
    const functions = normalizeFunctions(step.functions);

    functions.forEach(funcName => {
      const funcNodeId = `F${nodeId++}`;
      const safeLabel = sanitizeSwmlLabel(funcName);
      lines.push(`    ${funcNodeId}["${safeLabel}"]:::funcNode`);
      lines.push(`    ${stepNodeId} -.-> ${funcNodeId}`);
    });

    // If gather_info, show a gather_submit node indicating Q&A collection
    if (step.gather_info) {
      const numQuestions = (step.gather_info.questions || []).length;
      const gatherNodeId = `G${nodeId++}`;
      lines.push(`    ${gatherNodeId}["gather_submit<br/>(${numQuestions} questions)"]:::gatherNode`);
      lines.push(`    ${stepNodeId} -.-> ${gatherNodeId}`);
    }
  });

  return lines.join('\n');
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

function sanitizeSwmlLabel(text) {
  if (!text) return '';
  return String(text)
    .replace(/"/g, '#quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function findAiConfig(swml) {
  const mainSection = swml.sections?.main || [];
  for (const item of mainSection) {
    if (item.ai) return item.ai;
  }
  return null;
}

function setupSwmlZoomPan(svg, container) {
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let startX, startY;

  const g = svg.querySelector('g');
  if (!g) return;

  function updateTransform() {
    g.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`);
  }

  // Zoom controls
  const zoomIn = container.querySelector('#swml-zoom-in');
  const zoomOut = container.querySelector('#swml-zoom-out');
  const zoomReset = container.querySelector('#swml-zoom-reset');

  zoomIn?.addEventListener('click', () => {
    scale = Math.min(scale * 1.2, 5);
    updateTransform();
  });

  zoomOut?.addEventListener('click', () => {
    scale = Math.max(scale / 1.2, 0.1);
    updateTransform();
  });

  zoomReset?.addEventListener('click', () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
  });

  // Mouse wheel zoom
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.min(Math.max(scale * delta, 0.1), 5);
    updateTransform();
  });

  // Pan on drag
  svg.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'path' || e.target.tagName === 'text') return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    svg.style.cursor = 'grabbing';
  });

  svg.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
  });

  svg.addEventListener('mouseup', () => {
    isDragging = false;
    svg.style.cursor = 'grab';
  });

  svg.addEventListener('mouseleave', () => {
    isDragging = false;
    svg.style.cursor = 'default';
  });

  svg.style.cursor = 'grab';
}

function makeSwmlEdgesClickable(svg) {
  const edges = svg.querySelectorAll('.edge path, .flowchart-link');
  let selectedEdge = null;

  edges.forEach(edge => {
    edge.style.cursor = 'pointer';
    edge.style.transition = 'stroke-width 0.2s, stroke 0.2s';

    edge.addEventListener('click', (e) => {
      e.stopPropagation();

      // Reset previous selection
      if (selectedEdge && selectedEdge !== edge) {
        selectedEdge.style.strokeWidth = '';
        selectedEdge.style.stroke = '';
      }

      // Toggle current selection
      if (selectedEdge === edge) {
        edge.style.strokeWidth = '';
        edge.style.stroke = '';
        selectedEdge = null;
      } else {
        edge.style.strokeWidth = '3px';
        edge.style.stroke = '#f59e0b';
        selectedEdge = edge;
      }
    });

    edge.addEventListener('mouseenter', () => {
      if (selectedEdge !== edge) {
        edge.style.strokeWidth = '2px';
      }
    });

    edge.addEventListener('mouseleave', () => {
      if (selectedEdge !== edge) {
        edge.style.strokeWidth = '';
      }
    });
  });

  // Click outside to deselect
  svg.addEventListener('click', (e) => {
    if (e.target === svg || e.target.tagName === 'g') {
      if (selectedEdge) {
        selectedEdge.style.strokeWidth = '';
        selectedEdge.style.stroke = '';
        selectedEdge = null;
      }
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPromptContent(prompt) {
  // Handle bullets array
  if (prompt.bullets && Array.isArray(prompt.bullets)) {
    return `<ul class="swml-prompt-bullets">
      ${prompt.bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('')}
    </ul>`;
  }
  // Handle body text
  if (prompt.body) {
    return `<pre class="swml-prompt-text">${escapeHtml(prompt.body)}</pre>`;
  }
  return '<p style="color: var(--text-muted); font-style: italic;">No content</p>';
}

function getPromptCopyValue(prompt) {
  if (prompt.bullets && Array.isArray(prompt.bullets)) {
    return prompt.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
  }
  return prompt.body || '';
}

async function downloadSvgAsImage(svgElement, filename) {
  // Clone SVG to avoid modifying the original
  const clonedSvg = svgElement.cloneNode(true);

  // Remove any pan/zoom transforms from the main group to get true dimensions
  const g = clonedSvg.querySelector('g');
  if (g) {
    g.removeAttribute('transform');
  }

  // Make edge paths visible with dark color on white background
  const allPaths = clonedSvg.querySelectorAll('path');
  allPaths.forEach(path => {
    const currentStroke = path.getAttribute('stroke');
    if (currentStroke && currentStroke !== 'none') {
      path.setAttribute('stroke', '#374151');
      path.setAttribute('stroke-width', '2');
    }
  });

  // Make all text larger and bolder
  const texts = clonedSvg.querySelectorAll('text');
  texts.forEach(text => {
    const currentSize = parseFloat(text.getAttribute('font-size') || '14');
    text.setAttribute('font-size', Math.max(currentSize * 1.2, 14));
    text.setAttribute('font-weight', '600');
    text.setAttribute('fill', '#f1f5f9');
  });

  // Clean edge label backgrounds
  const edgeLabelRects = clonedSvg.querySelectorAll('.edgeLabel rect, .edge-label rect');
  edgeLabelRects.forEach(rect => {
    rect.setAttribute('fill', '#1f2937');
    rect.setAttribute('stroke', 'none');
    rect.setAttribute('rx', '3');
  });

  // Get true bounding box of all content
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  document.body.appendChild(tempDiv);
  tempDiv.appendChild(clonedSvg);

  const bbox = clonedSvg.getBBox();
  const padding = 40; // Add padding around the diagram
  const width = Math.ceil(bbox.width + bbox.x * 2 + padding);
  const height = Math.ceil(bbox.height + bbox.y * 2 + padding);

  document.body.removeChild(tempDiv);

  // Prepare final SVG
  clonedSvg.setAttribute('width', width);
  clonedSvg.setAttribute('height', height);
  clonedSvg.setAttribute('viewBox', `${bbox.x - padding/2} ${bbox.y - padding/2} ${width} ${height}`);

  // Add dark background to SVG (matching app theme)
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', bbox.x - padding/2);
  rect.setAttribute('y', bbox.y - padding/2);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
  rect.setAttribute('fill', '#0f172a');
  clonedSvg.insertBefore(rect, clonedSvg.firstChild);

  // Serialize SVG to string and encode as data URI
  const svgString = new XMLSerializer().serializeToString(clonedSvg);
  const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));

  // Create image from SVG data URI
  const img = new Image();
  img.width = width;
  img.height = height;

  return new Promise((resolve, reject) => {
    img.onload = () => {
      try {
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // 2x for better quality
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');

        // Draw SVG (background already in SVG)
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);

        // Convert to blob and download
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create image blob'));
            return;
          }
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
          resolve();
        }, 'image/png', 0.95);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load SVG'));
    };

    img.src = svgDataUri;
  });
}
