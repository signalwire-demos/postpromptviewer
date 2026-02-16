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

export async function renderStateFlow(container, payload) {
  const flowData = extractStateFlow(payload);

  if (!flowData || flowData.transitions.length === 0) {
    const debugInfo = payload.swaigLog ?
      `Found ${payload.swaigLog.length} SWAIG log entries, but no change_step directives.` :
      'No swaigLog found in payload.';

    container.innerHTML = `
      <div style="padding:1.5rem;color:var(--text-muted)">
        <p>No state transitions found in conversation</p>
        <p style="font-size:0.85rem;margin-top:0.5rem;opacity:0.7">${debugInfo}</p>
      </div>
    `;
    return;
  }

  const mermaidDef = generateFlowDiagram(flowData);

  container.innerHTML = `
    <div class="state-flow">
      <div class="state-flow__header">
        <div>
          <h2 style="margin:0;font-size:1.25rem;font-weight:700;color:var(--text-primary)">State Flow Analysis</h2>
          <p style="margin:0.5rem 0 0 0;font-size:0.875rem;color:var(--text-secondary)">Actual state transitions and function calls during this conversation</p>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button id="copy-flow-mermaid-btn" class="swml-flow-btn">Copy Mermaid</button>
          <button id="copy-flow-svg-btn" class="swml-flow-btn">Copy SVG</button>
        </div>
      </div>

      <div class="state-flow__stats">
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Total Transitions</div>
          <div class="swml-stat-card__value">${flowData.transitions.length}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Unique States</div>
          <div class="swml-stat-card__value">${flowData.uniqueStates.size}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Functions Called</div>
          <div class="swml-stat-card__value">${flowData.totalFunctions}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Duration</div>
          <div class="swml-stat-card__value">${flowData.duration}</div>
        </div>
      </div>

      <div class="state-flow__diagram-wrapper">
        <div class="state-flow__zoom-controls">
          <button class="zoom-btn" id="zoom-in" title="Zoom In">+</button>
          <button class="zoom-btn" id="zoom-out" title="Zoom Out">−</button>
          <button class="zoom-btn" id="zoom-reset" title="Reset Zoom">⊙</button>
        </div>
        <div class="state-flow__diagram" id="flow-mermaid-container">
          <div class="mermaid">${mermaidDef}</div>
        </div>
      </div>

      <div class="state-flow__timeline">
        <h3 class="swml-section-title">Transition Timeline</h3>
        <div class="flow-timeline">
          ${flowData.transitions.map((trans, idx) => `
            <div class="flow-timeline-item">
              <div class="flow-timeline-marker">${idx + 1}</div>
              <div class="flow-timeline-content">
                <div class="flow-timeline-step">${escapeHtml(trans.toState)}</div>
                <div class="flow-timeline-time">${formatTimestamp(trans.timestamp)}</div>
                ${trans.triggeredBy ? `
                  <div class="flow-timeline-trigger">
                    <strong>Triggered by:</strong> <code>${escapeHtml(trans.triggeredBy)}</code>
                  </div>
                ` : ''}
                ${trans.functionsInState && trans.functionsInState.length > 0 ? `
                  <div class="flow-timeline-functions">
                    <strong>Functions in this state:</strong>
                    ${trans.functionsInState.map(fn => `<span class="swml-function-tag">${escapeHtml(fn)}</span>`).join('')}
                  </div>
                ` : ''}
                ${trans.instructions ? `
                  <div class="flow-timeline-instructions">
                    <button class="flow-instructions-toggle" data-idx="${idx}">
                      <span class="flow-instructions-arrow">▶</span> View Instructions
                    </button>
                    <pre class="flow-instructions-content" data-idx="${idx}">${escapeHtml(trans.instructions)}</pre>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Render mermaid diagram
  try {
    const mermaidElement = container.querySelector('.mermaid');
    await mermaid.run({ nodes: [mermaidElement] });

    // Add zoom/pan functionality
    const svg = container.querySelector('#flow-mermaid-container svg');
    if (svg) {
      setupZoomPan(svg, container);
      makeEdgesClickable(svg);
    }
  } catch (error) {
    console.error('Mermaid rendering error:', error);
    container.querySelector('#flow-mermaid-container').innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--text-muted)">
        <p>Failed to render diagram</p>
        <pre style="margin-top:1rem;text-align:left;font-size:0.7rem;overflow:auto">${escapeHtml(error.message)}</pre>
      </div>
    `;
  }

  // Add copy mermaid button handler
  const copyMermaidBtn = container.querySelector('#copy-flow-mermaid-btn');
  copyMermaidBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(mermaidDef).then(() => {
      copyMermaidBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyMermaidBtn.textContent = 'Copy Mermaid';
      }, 2000);
    });
  });

  // Add copy SVG button handler
  const copySvgBtn = container.querySelector('#copy-flow-svg-btn');
  copySvgBtn?.addEventListener('click', () => {
    const svg = container.querySelector('#flow-mermaid-container svg');
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

  // Add instructions toggle handlers
  container.querySelectorAll('.flow-instructions-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      const content = container.querySelector(`.flow-instructions-content[data-idx="${idx}"]`);
      const arrow = btn.querySelector('.flow-instructions-arrow');

      if (content.style.display === 'block') {
        content.style.display = 'none';
        arrow.textContent = '▶';
      } else {
        content.style.display = 'block';
        arrow.textContent = '▼';
      }
    });
  });
}

function extractStateFlow(payload) {
  const swaigLog = payload.swaigLog || [];
  const callLog = payload.callLog || [];

  // Extract step names and timestamps from swaig_log
  const stepChanges = [];
  let currentStep = null;

  swaigLog.forEach(entry => {
    const postResponse = entry.postResponse || entry.post_response;
    if (!postResponse || !postResponse.action || !Array.isArray(postResponse.action)) {
      return;
    }

    const commandName = entry.commandName || entry.command_name;
    const timestamp = (entry.epochTime || entry.epoch_time) * 1000000;

    // Find change_step directive
    let newStep = null;
    postResponse.action.forEach(action => {
      if (action && action.change_step) {
        newStep = action.change_step;
      }
    });

    // Record step change if it's different from current
    if (newStep && newStep !== currentStep) {
      stepChanges.push({
        timestamp: timestamp,
        step: newStep,
        triggeredBy: commandName,
      });
      currentStep = newStep;
    }
  });

  // Build map of function calls with timestamps from call_log
  const functionCalls = [];
  callLog.forEach(entry => {
    if (entry.role === 'system-log' && entry.content && entry.content.startsWith('Calling function:')) {
      const funcMatch = entry.content.match(/Calling function: ([^(]+)/);
      if (funcMatch) {
        functionCalls.push({
          timestamp: entry.timestamp,
          name: funcMatch[1].trim(),
        });
      }
    }
  });

  // Get instructions from call_log
  const instructionsByTimestamp = new Map();
  callLog.forEach(entry => {
    if (entry.role === 'system-log' && entry.content && entry.content.includes('## Current Task')) {
      instructionsByTimestamp.set(entry.timestamp, entry.content);
    }
  });

  // Build transitions with functions
  const transitions = [];
  stepChanges.forEach((stepChange, idx) => {
    const nextStepChange = stepChanges[idx + 1];
    const stepEndTime = nextStepChange ? nextStepChange.timestamp : Infinity;

    // Find all functions called during this step
    const functionsCalledInStep = functionCalls
      .filter(fc => fc.timestamp >= stepChange.timestamp && fc.timestamp < stepEndTime)
      .map(fc => fc.name);

    // Get unique function names while preserving order
    const uniqueFunctions = [...new Set(functionsCalledInStep)];

    // Find instructions near this timestamp
    let instructions = null;
    const instructionTimestamps = Array.from(instructionsByTimestamp.keys());
    const closestInstruction = instructionTimestamps
      .filter(ts => ts <= stepChange.timestamp)
      .sort((a, b) => b - a)[0];
    if (closestInstruction) {
      instructions = instructionsByTimestamp.get(closestInstruction);
    }

    transitions.push({
      timestamp: stepChange.timestamp,
      toState: stepChange.step,
      triggeredBy: stepChange.triggeredBy,
      functionsInState: uniqueFunctions,
      instructions: instructions,
    });
  });


  // Calculate stats
  const uniqueStates = new Set(transitions.map(t => t.toState));
  const totalFunctions = transitions.reduce((sum, trans) => sum + trans.functionsInState.length, 0);

  let duration = 'N/A';
  if (transitions.length > 0) {
    const start = transitions[0].timestamp;
    const end = transitions[transitions.length - 1].timestamp;
    const durationSeconds = Math.round((end - start) / 1000000);
    duration = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
  }

  return {
    transitions,
    uniqueStates,
    totalFunctions,
    duration,
  };
}

function generateFlowDiagram(flowData) {
  const { transitions } = flowData;

  let diagram = 'stateDiagram-v2\n';
  diagram += '    direction TB\n\n';
  diagram += '    [*] --> s0\n\n';

  // Add all states
  const stateMap = new Map();
  transitions.forEach((trans, idx) => {
    const stateId = `s${idx}`;
    stateMap.set(trans.toState, stateId);
    const stateName = trans.toState.replace(/"/g, '\\"');
    diagram += `    ${stateId}: ${stateName}\n`;
  });

  diagram += '\n';

  // Add transitions
  transitions.forEach((trans, idx) => {
    const currentId = `s${idx}`;
    const nextId = `s${idx + 1}`;

    if (idx < transitions.length - 1) {
      const edgeLabel = trans.triggeredBy ? trans.triggeredBy : '';
      if (edgeLabel) {
        diagram += `    ${currentId} --> ${nextId}: ${edgeLabel}\n`;
      } else {
        diagram += `    ${currentId} --> ${nextId}\n`;
      }
    } else {
      diagram += `    ${currentId} --> [*]\n`;
    }
  });

  // Add function notes
  diagram += '\n';
  transitions.forEach((trans, idx) => {
    const stateId = `s${idx}`;
    if (trans.functionsInState && trans.functionsInState.length > 0) {
      const funcList = trans.functionsInState.join(', ');
      const cleanFuncs = funcList.replace(/"/g, '\\"');
      diagram += `    note right of ${stateId}\n`;
      diagram += `      Functions: ${cleanFuncs}\n`;
      diagram += `    end note\n`;
    }
  });

  return diagram;
}

function formatTimestamp(timestamp) {
  // Convert microsecond timestamp to readable format
  const date = new Date(timestamp / 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = Math.floor((timestamp % 1000000) / 1000);
  return `${hours}:${minutes}:${seconds}.${ms.toString().padStart(3, '0')}`;
}

function setupZoomPan(svg, container) {
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
  const zoomIn = container.querySelector('#zoom-in');
  const zoomOut = container.querySelector('#zoom-out');
  const zoomReset = container.querySelector('#zoom-reset');

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

function makeEdgesClickable(svg) {
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
