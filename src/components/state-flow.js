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

/**
 * Normalize call_timeline entries into the same shape as callLog entries.
 * call_timeline is a pre-flattened array with { ts, type, ...metadata } at top level.
 */
function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) return [];
  return timeline.map(entry => {
    const { ts, type, ...rest } = entry;
    return {
      role: 'system-log',
      action: type,
      timestamp: ts,
      metadata: rest,
      content: rest.text || rest.content || '',
    };
  });
}

export async function renderStateFlow(container, payload) {
  const flowData = extractStateFlow(payload);

  if (!flowData || flowData.transitions.length === 0) {
    const debugInfo = payload.swaigLog ?
      `Found ${payload.swaigLog.length} SWAIG log entries, but no step_change events.` :
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
          <button id="download-flow-image-btn" class="swml-flow-btn">Download Image</button>
        </div>
      </div>

      <div class="state-flow__stats">
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Total Transitions</div>
          <div class="swml-stat-card__value">${flowData.transitionCount}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Unique States</div>
          <div class="swml-stat-card__value">${flowData.uniqueStates.size}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">AI-Initiated</div>
          <div class="swml-stat-card__value" style="color:#10b981">${flowData.aiInitiated}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Forced</div>
          <div class="swml-stat-card__value" style="color:#f97316">${flowData.toolForced}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Tool Calls</div>
          <div class="swml-stat-card__value">${flowData.totalFunctions}</div>
        </div>
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Duration</div>
          <div class="swml-stat-card__value">${flowData.duration}</div>
        </div>
        ${flowData.functionErrors > 0 ? `
        <div class="swml-stat-card">
          <div class="swml-stat-card__label">Errors</div>
          <div class="swml-stat-card__value" style="color:#ef4444">${flowData.functionErrors}</div>
        </div>
        ` : ''}
      </div>

      <div class="state-flow__diagram-wrapper">
        <div class="flow-legend">
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#3b82f6;border-color:#2563eb"></span>Step / State</span>
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#f59e0b;border-color:#d97706"></span>Function Call</span>
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#6b7280;border-color:#4b5563"></span>Gather / Q&A</span>
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#7c3aed;border-color:#6d28d9"></span>Action</span>
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#0284c7;border-color:#0369a1"></span>Navigation</span>
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#dc2626;border-color:#b91c1c"></span>Terminal</span>
          <span class="flow-legend-item"><span class="flow-legend-swatch" style="background:#450a0a;border-color:#dc2626"></span>Error</span>
        </div>
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
        <h3 class="swml-section-title">Complete Execution Timeline</h3>
        <div class="flow-timeline">
          ${flowData.detailedTimeline.map((item, idx) => `
            <div class="flow-timeline-item${item.type === 'function_error' || item.type === 'gather_reject' ? ' flow-timeline-item--error' : ''}${item.type === 'filler' || item.type === 'summarize_start' ? ' flow-timeline-item--muted' : ''}">
              <div class="flow-timeline-marker${item.type === 'function_error' ? ' flow-timeline-marker--error' : ''}${item.type === 'context_enter' ? ' flow-timeline-marker--nav' : ''}${item.type === 'reset' ? ' flow-timeline-marker--terminal' : ''}${item.type === 'filler' ? ' flow-timeline-marker--filler' : ''}${item.type === 'attention_timeout' ? ' flow-timeline-marker--warning' : ''}">${idx + 1}</div>
              <div class="flow-timeline-content">
                ${item.type === 'state' ? `
                  <div class="flow-timeline-step">
                    <strong>→ ${escapeHtml(item.state)}</strong>
                    ${item.stepIndex !== null && item.stepIndex !== undefined ? `<span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">(index ${item.stepIndex})</span>` : ''}
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>
                  ${item.triggeredBy ? `
                    <div class="flow-timeline-trigger">
                      <strong>Triggered by:</strong> <code>${escapeHtml(item.triggeredBy)}</code>
                      ${item.source === 'ai' ? '<span style="color:#10b981;margin-left:0.5rem;font-size:0.7rem">● AI-initiated</span>' : ''}
                      ${item.source === 'tool' || item.source === 'gather' ? '<span style="color:#f59e0b;margin-left:0.5rem;font-size:0.7rem">● Forced</span>' : ''}
                      ${item.source === 'explicit' ? '<span style="color:#3b82f6;margin-left:0.5rem;font-size:0.7rem">● Explicit transition</span>' : ''}
                      ${item.source === 'implicit' ? '<span style="color:#9ca3af;margin-left:0.5rem;font-size:0.7rem">● Implicit state</span>' : ''}
                    </div>
                  ` : ''}

                ` : item.type === 'function' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem">
                    <code style="color:#f59e0b;font-size:0.9rem">${escapeHtml(item.functionName)}</code>
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">${item.source === 'swaig_log' ? '(swaig)' : ''}</span>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>
                  ${item.question ? `
                    <div class="flow-timeline-detail">
                      <span class="flow-timeline-detail-label">Question</span>
                      <span style="color:#e5e7eb">${escapeHtml(item.question)}</span>
                    </div>
                  ` : ''}
                  ${item.args ? `
                    <div class="flow-timeline-detail">
                      <span class="flow-timeline-detail-label">Args</span>
                      ${renderDataItems(parseJsonValue(item.args), `flow-${idx}-args`)}
                    </div>
                  ` : ''}
                  ${item.result ? `
                    <div class="flow-timeline-detail">
                      <span class="flow-timeline-detail-label" style="color:#10b981">Result</span>
                      ${renderDataItems(parseJsonValue(item.result), `flow-${idx}-result`)}
                    </div>
                  ` : ''}
                  ${item.swaigActions && item.swaigActions.length > 0 ? `
                    <div class="flow-timeline-detail">
                      <span class="flow-timeline-detail-label" style="color:#7c3aed">Actions</span>
                      ${item.swaigActions.map((a, ai) => `
                        <div class="flow-timeline-action-block">
                          <span class="flow-timeline-action-tag">${escapeHtml(a.verb)}</span>
                          ${a.data ? renderDataItems(parseJsonValue(a.data), `flow-${idx}-action-${ai}`) : ''}
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}

                ` : item.type === 'context_enter' ? `
                  <div class="flow-timeline-step">
                    <strong style="color:#0284c7">⤷ Context: ${escapeHtml(item.toContext || 'unknown')}</strong>
                    ${item.fromContext ? `<span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">from ${escapeHtml(item.fromContext)}</span>` : ''}
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

                ` : item.type === 'reset' ? `
                  <div class="flow-timeline-step">
                    <strong style="color:#dc2626">⟲ Reset: ${escapeHtml(item.resetType)}</strong>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

                ` : item.type === 'gather_group' ? `
                  <div class="flow-timeline-step">
                    <strong style="color:#6b7280">Gather</strong>
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">${item.totalQuestions} question${item.totalQuestions !== 1 ? 's' : ''}${item.outputKey ? `, key: ${escapeHtml(item.outputKey)}` : ''}</span>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>
                  ${item.questions.length > 0 ? `
                    <div class="flow-timeline-detail" style="padding-left:0">
                      ${item.questions.map(q => `
                        <div class="flow-timeline-gather-question">
                          <span class="flow-timeline-gather-key">${escapeHtml(q.key || '?')}</span>
                          <span style="color:var(--text-muted);font-size:0.7rem">${q.questionType || ''}${q.requiresConfirm ? ' (confirm)' : ''}</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                  ${item.rejects.length > 0 ? `
                    <div class="flow-timeline-detail" style="padding-left:0">
                      ${item.rejects.map(r => `
                        <div class="flow-timeline-gather-reject">
                          <span class="flow-timeline-badge--error">rejected</span>
                          <span style="color:var(--text-muted);font-size:0.7rem">${escapeHtml(r.reason)} (attempt ${r.attempt})</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                  ${item.complete ? `
                    <div class="flow-timeline-detail" style="padding-left:0">
                      <div style="margin-top:0.25rem">
                        <span class="flow-timeline-badge--success">complete</span>
                        <span style="color:var(--text-muted);font-size:0.7rem">${item.complete.answeredCount} answered${item.complete.completionAction ? ` → ${escapeHtml(item.complete.completionAction)}` : ''}</span>
                      </div>
                    </div>
                  ` : ''}

                ` : item.type === 'gather_reject' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem">
                    <span class="flow-timeline-badge--error">Gather Rejected</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">${escapeHtml(item.reason)} (attempt ${item.attempt})</span>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

                ` : item.type === 'function_error' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem">
                    <span class="flow-timeline-badge--error">ERROR</span>
                    <code style="color:#fca5a5;font-size:0.9rem;margin-left:0.5rem">${escapeHtml(item.functionName)}</code>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>
                  <div class="flow-timeline-detail">
                    <span class="flow-timeline-detail-label" style="color:#dc2626">Error</span>
                    <span style="color:#fca5a5">${escapeHtml(item.errorType)}${item.httpCode ? ` (HTTP ${item.httpCode})` : ''}</span>
                    ${item.errorMessage ? `<span style="color:var(--text-muted);font-size:0.75rem">${escapeHtml(item.errorMessage)}</span>` : ''}
                  </div>

                ` : item.type === 'startup_hook' || item.type === 'hangup_hook' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem">
                    <code style="color:#f59e0b;font-size:0.9rem">${item.type === 'startup_hook' ? 'startup_hook' : 'hangup_hook'}</code>
                    ${item.durationMs ? `<span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">${item.durationMs}ms</span>` : ''}
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

                ` : item.type === 'manual_say' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem">
                    <strong style="color:#fb923c">Say</strong>
                    ${item.isError ? '<span class="flow-timeline-badge--error" style="margin-left:0.5rem">error</span>' : ''}
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>
                  <div class="flow-timeline-detail">
                    <span style="color:var(--text-primary);font-size:0.8rem">${escapeHtml(item.text)}</span>
                    ${item.isError && item.errorReason ? `<span style="color:#fca5a5;font-size:0.75rem">${escapeHtml(item.errorReason)}</span>` : ''}
                  </div>

                ` : item.type === 'filler' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem;opacity:0.6">
                    <span style="color:var(--text-muted);font-size:0.85rem">Filler: "${escapeHtml(item.text)}"</span>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

                ` : item.type === 'attention_timeout' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem">
                    <strong style="color:#ef4444">Attention Timeout</strong>
                    ${item.timeoutMs ? `<span style="color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem">${item.timeoutMs}ms</span>` : ''}
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

                ` : item.type === 'summarize_start' ? `
                  <div class="flow-timeline-step" style="padding-left:1.5rem;opacity:0.6">
                    <span style="color:var(--text-secondary);font-size:0.85rem">Summarization started</span>
                  </div>
                  <div class="flow-timeline-time">${formatTimestamp(item.timestamp)}</div>

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

  // Add download image button handler
  const downloadImageBtn = container.querySelector('#download-flow-image-btn');
  downloadImageBtn?.addEventListener('click', async () => {
    const svg = container.querySelector('#flow-mermaid-container svg');
    if (svg) {
      try {
        await downloadSvgAsImage(svg, 'state-flow-diagram.png', 'State Flow Diagram', [
          { color: '#3b82f6', stroke: '#2563eb', label: 'Step / State' },
          { color: '#f59e0b', stroke: '#d97706', label: 'Function Call' },
          { color: '#6b7280', stroke: '#4b5563', label: 'Gather / Q&A' },
          { color: '#7c3aed', stroke: '#6d28d9', label: 'Action' },
          { color: '#0284c7', stroke: '#0369a1', label: 'Navigation' },
          { color: '#dc2626', stroke: '#b91c1c', label: 'Terminal' },
          { color: '#450a0a', stroke: '#dc2626', label: 'Error' },
        ]);
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

  // Add expand/collapse handlers for nested data items
  container.querySelectorAll('.swaig-data-nested-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle.closest('.swaig-data-item').classList.toggle('expanded');
    });
  });

  // Copy item button handlers
  container.querySelectorAll('.swaig-data-item-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.value).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
      });
    });
  });
}

function extractStateFlow(payload) {
  const swaigLog = payload.swaigLog || [];
  const callLog = payload.callLog || [];
  // Merge call_timeline events into callLog processing when available
  const timelineEvents = payload.callTimeline ? normalizeTimeline(payload.callTimeline) : [];

  // Extract ALL step changes from call_log structured metadata
  const allStepChanges = [];

  callLog.forEach(entry => {
    if (entry.role !== 'system-log' || entry.action !== 'step_change') return;
    const m = entry.metadata || {};
    const trigger = m.trigger;
    const source = trigger === 'ai_function' ? 'ai'
      : trigger === 'webhook_action' ? 'tool'
      : trigger === 'gather_complete' ? 'gather'
      : trigger === 'auto_advance' ? 'auto'
      : 'unknown';
    const triggeredBy = trigger === 'ai_function' ? 'AI: next_step'
      : trigger === 'webhook_action' ? 'webhook → step_change'
      : trigger === 'gather_complete' ? 'gather complete → next_step'
      : trigger === 'auto_advance' ? 'auto advance'
      : trigger || 'unknown';

    allStepChanges.push({
      timestamp: entry.timestamp,
      step: m.to_step,
      stepIndex: m.to_index ?? null,
      fromStep: m.from_step || null,
      fromIndex: m.from_index ?? null,
      triggeredBy,
      source,
    });
  });

  // Sort all step changes by timestamp
  allStepChanges.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate consecutive identical steps
  const stepChanges = [];
  let currentStep = null;

  allStepChanges.forEach(change => {
    if (change.step !== currentStep) {
      stepChanges.push(change);
      currentStep = change.step;
    }
  });

  // Build comprehensive map of ALL function calls from both call_log and swaig_log
  // MUST be defined BEFORE we check for initial state
  const functionCalls = [];

  // Build ordered list of swaig_log gather_submit entries for answer value lookup
  const swaigGathers = swaigLog
    .filter(e => (e.command_name || e.commandName) === 'gather_submit')
    .sort((a, b) => (a.epoch_time || a.epochTime) - (b.epoch_time || b.epochTime));
  let swaigGatherIdx = 0;

  // Extract function calls and gather answers from call_log structured metadata
  callLog.forEach(entry => {
    if (entry.role !== 'system-log' || !entry.action) return;

    if (entry.action === 'gather_answer') {
      const m = entry.metadata || {};
      // Pull answer value from the corresponding swaig_log gather_submit (in order)
      let answerArg = null;
      const swaigSubmit = swaigGathers[swaigGatherIdx++];
      if (swaigSubmit) {
        answerArg = swaigSubmit.command_arg || swaigSubmit.commandArg || null;
      }
      functionCalls.push({
        timestamp: entry.timestamp,
        metaStep: m.step || null,
        name: 'gather_submit',
        args: answerArg,
        result: null,
        question: m.key || null,
        source: 'call_log',
      });
    }
    else if (entry.action === 'function_call') {
      const m = entry.metadata || {};
      if (m.function) {
        functionCalls.push({
          timestamp: entry.timestamp,
          metaStep: m.step || null,
          name: m.function,
          native: m.native || false,
          durationMs: m.duration_ms || 0,
          error: m.error || null,
          args: null,
          result: null,
          source: 'call_log',
        });
      }
    }
  });

  // Collect call_log function names for gap-filling
  const callLogFuncNames = new Set(functionCalls.map(fc => fc.name));

  // Add swaig-only functions that never appear in call_log (e.g. hangup)
  swaigLog.forEach(entry => {
    const name = entry.commandName || entry.command_name;
    const epochUs = (entry.epochTime || entry.epoch_time) * 1000000;
    if (name && !callLogFuncNames.has(name)) {
      const args = (entry.commandArg || entry.command_arg) || null;
      functionCalls.push({
        timestamp: epochUs,
        name,
        args: typeof args === 'string' ? args : JSON.stringify(args),
        result: null,
        source: 'swaig_log',
      });
    }
  });

  // Build swaig action map: keyed by command_name, ordered by epoch_time
  // so we can match each function call to its swaig response
  const swaigActionsByFunc = {};
  swaigLog.forEach(entry => {
    const name = entry.commandName || entry.command_name;
    const epochUs = (entry.epochTime || entry.epoch_time) * 1000000;
    const actions = (entry.postResponse || entry.post_response)?.action || [];

    const commandArg = entry.commandArg || entry.command_arg || null;
    const response = (entry.postResponse || entry.post_response)?.response || null;

    if (!swaigActionsByFunc[name]) swaigActionsByFunc[name] = [];
    swaigActionsByFunc[name].push({ epochUs, actions, commandArg, response });
  });
  // Sort each by time so we can match in order
  Object.values(swaigActionsByFunc).forEach(arr => arr.sort((a, b) => a.epochUs - b.epochUs));
  const swaigMatchIndex = {}; // tracks how many times we've matched each func name

  // Sort all function calls by timestamp
  functionCalls.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate function calls - same function at same timestamp (within 1ms)
  const deduplicatedFunctionCalls = [];
  const seen = new Map();

  functionCalls.forEach(fc => {
    const key = `${fc.name}_${Math.floor(fc.timestamp / 1000)}`; // Group by function name and millisecond
    if (!seen.has(key)) {
      seen.set(key, true);
      deduplicatedFunctionCalls.push(fc);
    }
  });

  // Enrich each function call with its swaig actions (match in order by func name)
  deduplicatedFunctionCalls.forEach(fc => {
    const candidates = swaigActionsByFunc[fc.name];
    if (!candidates || candidates.length === 0) return;

    const matchIdx = swaigMatchIndex[fc.name] || 0;
    if (matchIdx < candidates.length) {
      const match = candidates[matchIdx];
      const rawActions = match.actions;
      fc.swaigActions = extractInterestingActions(rawActions);
      // Flag if this function's response contained a change_step — it forced the transition
      fc.webhookForced = rawActions.some(a => a.change_step !== undefined);
      // Backfill args/result from swaig_log when call_log didn't have them
      if (!fc.args && match.commandArg) fc.args = match.commandArg;
      if (!fc.result && match.response) fc.result = match.response;
      swaigMatchIndex[fc.name] = matchIdx + 1;
    }
  });

  // Fix metaStep for webhook-forced functions.
  // When a function returns change_step:X, the module transitions to X first, THEN logs
  // the function_call event with step=X as the metadata. But the function actually ran
  // in the previous step. Detect this: webhookForced + metaStep matches a webhook step_change
  // that fired within 100ms before the function was logged → reassign to the from_step.
  deduplicatedFunctionCalls.forEach(fc => {
    if (!fc.metaStep || !fc.webhookForced) return;

    const priorTransition = allStepChanges.find(sc =>
      sc.step === fc.metaStep &&
      sc.source === 'tool' &&               // webhook_action trigger
      sc.timestamp <= fc.timestamp &&
      (fc.timestamp - sc.timestamp) < 100000 && // within 100ms
      sc.fromStep !== null
    );

    if (priorTransition) {
      fc.metaStep = priorTransition.fromStep;
    }
  });

  // Replace with deduplicated array
  functionCalls.length = 0;
  functionCalls.push(...deduplicatedFunctionCalls);

  // Get initial step name from session_start metadata
  const sessionStartEntry = callLog.find(e => e.role === 'system-log' && e.action === 'session_start');
  const initialStepName = sessionStartEntry?.metadata?.step || 'Initial State';

  // NOW check for initial state (after functionCalls is populated)
  // If we have function calls but no step changes, create an initial implicit state
  if (stepChanges.length === 0 && functionCalls.length > 0) {
    stepChanges.push({
      timestamp: callLog[0]?.timestamp || Date.now() * 1000,
      step: initialStepName,
      stepIndex: 0,
      triggeredBy: 'Initial state',
      source: 'implicit',
    });
  }
  // If we have step changes but functions happened BEFORE the first step change,
  // add an initial state to capture those functions
  else if (stepChanges.length > 0 && functionCalls.length > 0) {
    const firstStepChangeTime = stepChanges[0].timestamp;
    const functionsBeforeFirstStep = functionCalls.filter(fc => fc.timestamp < firstStepChangeTime);

    if (functionsBeforeFirstStep.length > 0) {

      stepChanges.unshift({
        timestamp: callLog[0]?.timestamp || functionCalls[0].timestamp,
        step: initialStepName,
        stepIndex: 0,
        triggeredBy: 'Implicit initial state',
        source: 'implicit',
      });
    }
  }

  // Get instructions from call_log
  const instructionsByTimestamp = new Map();
  callLog.forEach(entry => {
    if (entry.role === 'system-log' && entry.content && entry.content.includes('## Current Task')) {
      instructionsByTimestamp.set(entry.timestamp, entry.content);
    }
  });

  // Build transitions with functions
  const transitions = [];

  // Track which functions have been assigned to avoid double-counting
  const assignedFunctionIndices = new Set();

  stepChanges.forEach((stepChange, idx) => {
    const nextStepChange = stepChanges[idx + 1];

    // For the initial implicit state, include ALL functions before the first explicit step change
    // For other states, include functions after this step change but before the next one
    const stepStartTime = stepChange.timestamp;
    const stepEndTime = nextStepChange ? nextStepChange.timestamp : Infinity;

    // Find all functions called during this step
    const functionsCalledInStep = [];
    functionCalls.forEach((fc, fcIdx) => {
      if (assignedFunctionIndices.has(fcIdx)) return; // Skip if already assigned

      // For implicit initial state, include everything before first explicit step
      if (stepChange.source === 'implicit' && idx === 0 && nextStepChange) {
        if (fc.timestamp < nextStepChange.timestamp) {
          functionsCalledInStep.push(fc.name);
          assignedFunctionIndices.add(fcIdx);
        }
      }
      // For other states: prefer metaStep (authoritative from enriched format),
      // fall back to timestamp window for gap-fill entries from swaig_log
      else {
        const matchesByMeta = fc.metaStep && fc.metaStep === stepChange.step;
        const matchesByTime = !fc.metaStep && fc.timestamp >= stepStartTime && fc.timestamp < stepEndTime;
        if (matchesByMeta || matchesByTime) {
          functionsCalledInStep.push(fc.name);
          assignedFunctionIndices.add(fcIdx);
        }
      }
    });

    // Count function occurrences
    const functionCounts = {};
    functionsCalledInStep.forEach(name => {
      functionCounts[name] = (functionCounts[name] || 0) + 1;
    });

    // Create array of functions with counts for display
    const functionsWithCounts = Object.entries(functionCounts).map(([name, count]) => ({
      name,
      count,
      display: count > 1 ? `${name} (${count}x)` : name
    }));

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
      stepIndex: stepChange.stepIndex,
      triggeredBy: stepChange.triggeredBy,
      source: stepChange.source,
      functionsInState: functionsWithCounts,
      totalFunctionCalls: functionsCalledInStep.length,
      instructions: instructions,
    });
  });

  // If there are functions called AFTER all step changes (e.g., post_conversation hooks),
  // add a final pseudo-state to show them
  if (stepChanges.length > 0 && functionCalls.length > 0) {
    const lastStepTime = stepChanges[stepChanges.length - 1].timestamp;
    const functionsAfterLastStep = functionCalls.filter(fc => fc.timestamp > lastStepTime);

    if (functionsAfterLastStep.length > 0) {
      const uniqueFunctionsAfter = [...new Set(functionsAfterLastStep.map(fc => fc.name))];

      // Add as part of the last state's functions instead of creating a new state
      if (transitions.length > 0) {
        const lastTransition = transitions[transitions.length - 1];
        // Merge unique functions
        const allFunctions = [...lastTransition.functionsInState, ...uniqueFunctionsAfter];
        lastTransition.functionsInState = [...new Set(allFunctions)];
      }
    }
  }


  // Calculate stats — exclude synthetic implicit initial state from counts
  const realTransitions = transitions.filter(t => t.source !== 'implicit');
  const uniqueStates = new Set(realTransitions.map(t => t.toState));
  const totalFunctions = transitions.reduce((sum, trans) => sum + (trans.totalFunctionCalls || trans.functionsInState.length), 0);
  const aiInitiated = realTransitions.filter(t => t.source === 'ai').length;
  const toolForced = realTransitions.filter(t => t.source === 'tool' || t.source === 'gather').length;

  let duration = 'N/A';
  if (transitions.length > 0) {
    const start = transitions[0].timestamp;
    const end = transitions[transitions.length - 1].timestamp;
    const durationSeconds = Math.round((end - start) / 1000000);
    duration = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
  }

  // Create detailed timeline with EVERY event (states and functions) in chronological order
  const detailedTimeline = [];

  // Add all state changes
  stepChanges.forEach(sc => {
    detailedTimeline.push({
      type: 'state',
      timestamp: sc.timestamp,
      state: sc.step,
      stepIndex: sc.stepIndex,
      triggeredBy: sc.triggeredBy,
      source: sc.source,
    });
  });

  // Add ALL individual function calls
  functionCalls.forEach(fc => {
    detailedTimeline.push({
      type: 'function',
      timestamp: fc.timestamp,
      functionName: fc.name,
      args: fc.args,
      question: fc.question || null,
      result: fc.result,
      source: fc.source,
      swaigActions: fc.swaigActions || [],
      metaStep: fc.metaStep || null,
      webhookForced: fc.webhookForced || false,
    });
  });

  // Extract enriched events from call_log (+ call_timeline if available) for the detailed timeline
  const gatherGroups = []; // Track gather lifecycle groups
  let currentGatherGroup = null;

  // Merge callLog and timelineEvents, deduplicating by timestamp+action
  const seen_events = new Set();
  const enrichedSource = [...callLog, ...timelineEvents].filter(entry => {
    if (entry.role !== 'system-log' || !entry.action) return false;
    const key = `${entry.timestamp}_${entry.action}`;
    if (seen_events.has(key)) return false;
    seen_events.add(key);
    return true;
  });
  enrichedSource.sort((a, b) => a.timestamp - b.timestamp);

  enrichedSource.forEach(entry => {
    const m = entry.metadata || {};

    switch (entry.action) {
      case 'context_enter':
        detailedTimeline.push({
          type: 'context_enter',
          timestamp: entry.timestamp,
          fromContext: m.from_context || null,
          toContext: m.to_context || m.context || null,
        });
        break;

      case 'reset':
        detailedTimeline.push({
          type: 'reset',
          timestamp: entry.timestamp,
          resetType: m.reset_type || m.type || 'full_reset',
        });
        break;

      case 'gather_start':
        currentGatherGroup = {
          type: 'gather_group',
          timestamp: entry.timestamp,
          totalQuestions: m.total_questions || 0,
          outputKey: m.output_key || null,
          questions: [],
          rejects: [],
          complete: null,
        };
        gatherGroups.push(currentGatherGroup);
        break;

      case 'gather_question':
        if (currentGatherGroup) {
          currentGatherGroup.questions.push({
            timestamp: entry.timestamp,
            key: m.key || m.name || null,
            questionType: m.type || null,
            requiresConfirm: m.requires_confirm || false,
          });
        }
        break;

      case 'gather_reject':
        if (currentGatherGroup) {
          currentGatherGroup.rejects.push({
            timestamp: entry.timestamp,
            reason: m.reason || 'unknown',
            attempt: m.attempt || 0,
          });
        }
        detailedTimeline.push({
          type: 'gather_reject',
          timestamp: entry.timestamp,
          reason: m.reason || 'unknown',
          attempt: m.attempt || 0,
        });
        break;

      case 'gather_complete':
        if (currentGatherGroup) {
          currentGatherGroup.complete = {
            timestamp: entry.timestamp,
            answeredCount: m.answered_count || m.answered || 0,
            completionAction: m.completion_action || m.action || null,
          };
        }
        break;

      case 'function_error':
        detailedTimeline.push({
          type: 'function_error',
          timestamp: entry.timestamp,
          functionName: m.function || m.name || 'unknown',
          errorType: m.error_type || m.type || 'unknown',
          httpCode: m.http_code || m.status_code || null,
          errorMessage: m.message || m.error || null,
        });
        break;

      case 'startup_hook':
        detailedTimeline.push({
          type: 'startup_hook',
          timestamp: entry.timestamp,
          durationMs: m.duration_ms || 0,
        });
        break;

      case 'hangup_hook':
        detailedTimeline.push({
          type: 'hangup_hook',
          timestamp: entry.timestamp,
          durationMs: m.duration_ms || 0,
        });
        break;

      case 'manual_say':
        detailedTimeline.push({
          type: 'manual_say',
          timestamp: entry.timestamp,
          text: m.text || entry.content || '',
          isError: m.is_error || false,
          errorReason: m.error_reason || null,
        });
        break;

      case 'filler':
        detailedTimeline.push({
          type: 'filler',
          timestamp: entry.timestamp,
          text: m.text || 'thinking...',
        });
        break;

      case 'attention_timeout':
        detailedTimeline.push({
          type: 'attention_timeout',
          timestamp: entry.timestamp,
          timeoutMs: m.timeout_ms || m.timeout || 0,
        });
        break;

      case 'summarize_start':
        detailedTimeline.push({
          type: 'summarize_start',
          timestamp: entry.timestamp,
        });
        break;
    }
  });

  // Add completed gather groups to timeline
  gatherGroups.forEach(gg => {
    detailedTimeline.push(gg);
  });

  // Sort by timestamp to get exact chronological order
  detailedTimeline.sort((a, b) => a.timestamp - b.timestamp);

  const functionErrors = detailedTimeline.filter(e => e.type === 'function_error').length;

  return {
    transitions,
    detailedTimeline,
    uniqueStates,
    transitionCount: realTransitions.length,
    totalFunctions,
    aiInitiated,
    toolForced,
    duration,
    functionErrors,
  };
}

function generateFlowDiagram(flowData) {
  const { transitions, detailedTimeline } = flowData;

  if (!transitions || transitions.length === 0) {
    return 'graph LR\n    START([Start]) --> END([End])\n';
  }

  let lines = ['graph LR'];
  lines.push('    classDef stepNode fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff');
  lines.push('    classDef funcNode fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#000');
  lines.push('    classDef forcedNode fill:#f97316,stroke:#ea580c,stroke-width:2px,color:#000');
  lines.push('    classDef gatherNode fill:#6b7280,stroke:#4b5563,stroke-width:2px,color:#fff');
  lines.push('    classDef actionNode fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#fff');
  lines.push('    classDef dataNode fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#fff');
  lines.push('    classDef navNode fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#fff');
  lines.push('    classDef terminalNode fill:#dc2626,stroke:#b91c1c,stroke-width:2px,color:#fff');
  lines.push('    classDef errorNode fill:#450a0a,stroke:#dc2626,stroke-width:3px,color:#fca5a5');
  lines.push('');

  let nodeId = 0;
  const stepNodes = {};
  const lastFuncPerStep = {};

  // Build flow structure with from/to for each transition
  const flow = [];
  let previousState = null;
  const claimed = new Set(); // track timeline items already assigned to a transition

  transitions.forEach((trans, idx) => {
    const currentState = trans.toState;

    // Add step_change
    if (previousState || idx === 0) {
      flow.push({
        type: 'step_change',
        from: previousState || 'START',
        to: currentState,
        timestamp: trans.timestamp,
        source: trans.source,
      });
    }

    // Add functions for this state
    const nextTrans = transitions[idx + 1];
    const timeStart = trans.timestamp;
    const timeEnd = nextTrans ? nextTrans.timestamp : Infinity;

    const funcs = detailedTimeline.filter((item, i) => {
      if (claimed.has(i)) return false;
      if (item.type !== 'function') return false;
      if (item.metaStep) return item.metaStep === currentState;
      return item.timestamp >= timeStart && item.timestamp < timeEnd;
    });

    funcs.forEach(f => {
      claimed.add(detailedTimeline.indexOf(f));
      flow.push({
        type: 'function_call',
        step: currentState,
        functionName: f.functionName,
        args: f.args,
        question: f.question || null,
        swaigActions: f.swaigActions || [],
        webhookForced: f.webhookForced || false,
      });
    });

    // Add function_error nodes for this state
    const errors = detailedTimeline.filter((item, i) => {
      if (claimed.has(i)) return false;
      return item.type === 'function_error' && item.timestamp >= timeStart && item.timestamp < timeEnd;
    });
    errors.forEach(e => {
      claimed.add(detailedTimeline.indexOf(e));
      flow.push({ type: 'function_error', step: currentState, functionName: e.functionName, errorType: e.errorType, httpCode: e.httpCode });
    });

    // Add context_enter transitions for this state
    const ctxEnters = detailedTimeline.filter((item, i) => {
      if (claimed.has(i)) return false;
      return item.type === 'context_enter' && item.timestamp >= timeStart && item.timestamp < timeEnd;
    });
    ctxEnters.forEach(c => {
      claimed.add(detailedTimeline.indexOf(c));
      flow.push({ type: 'context_enter', step: currentState, fromContext: c.fromContext, toContext: c.toContext });
    });

    // Add reset markers for this state
    const resets = detailedTimeline.filter((item, i) => {
      if (claimed.has(i)) return false;
      return item.type === 'reset' && item.timestamp >= timeStart && item.timestamp < timeEnd;
    });
    resets.forEach(r => {
      claimed.add(detailedTimeline.indexOf(r));
      flow.push({ type: 'reset', step: currentState, resetType: r.resetType });
    });

    previousState = currentState;
  });

  // First pass: Create all step nodes
  const allSteps = new Set();
  flow.forEach(item => {
    if (item.type === 'step_change') {
      allSteps.add(item.from);
      allSteps.add(item.to);
    }
  });

  allSteps.forEach(step => {
    const stepNodeId = `S${nodeId++}`;
    stepNodes[step] = stepNodeId;
    const safeLabel = sanitizeLabel(step);
    lines.push(`    ${stepNodeId}["${safeLabel}"]:::stepNode`);
  });

  lines.push('');

  // Second pass: Create step chain and attach functions
  flow.forEach(item => {
    if (item.type === 'step_change') {
      // Create step transition with source label
      const edgeLabel = item.source === 'ai' ? 'AI'
        : item.source === 'tool' ? '⚡ forced'
        : item.source === 'gather' ? '🎤 gather'
        : item.source === 'auto' ? 'auto'
        : '';
      const edge = edgeLabel ? `-->|"${sanitizeLabel(edgeLabel)}"|` : '-->';
      lines.push(`    ${stepNodes[item.from]} ${edge} ${stepNodes[item.to]}`);

    } else if (item.type === 'function_call') {
      const funcNodeId = `F${nodeId++}`;
      const funcName = item.functionName;
      const args = item.args;

      // Build label
      let label = funcName;
      let styleClass = 'funcNode';

      try {
        const argsObj = args ? JSON.parse(args) : null;

        if (funcName === 'gather_submit' && argsObj) {
          const answer = sanitizeLabel(argsObj.answer || '');
          const question = item.question ? sanitizeLabel(item.question) : null;

          if (question && answer) {
            label = `Q: ${question}<br/>A: ${answer}`;
          } else if (answer) {
            label = `gather_submit<br/>${answer}`;
          } else {
            label = 'gather_submit';
          }
          styleClass = 'gatherNode';
        } else if (funcName === 'resolve_location' && argsObj) {
          const location = sanitizeLabel(argsObj.location_text || '');
          const locType = argsObj.location_type || '';
          label = location ? `resolve_location<br/>${location} (${locType})` : 'resolve_location';
        } else if (funcName === 'select_trip_type' && argsObj) {
          const trip = (argsObj.trip_type || '').replace(/_/g, ' ');
          label = trip ? `select_trip_type<br/>${trip}` : 'select_trip_type';
        } else if (funcName === 'select_flight' && argsObj) {
          const option = argsObj.option_number || '';
          label = option ? `select_flight<br/>Option ${option}` : 'select_flight';
        } else if (['save_profile', 'search_flights', 'book_flight', 'get_flight_price', 'confirm_booking', 'summarize_conversation'].includes(funcName)) {
          label = funcName.replace(/_/g, ' ');
        }
      } catch (e) {
        // Keep default
      }

      lines.push(`    ${funcNodeId}["${sanitizeLabel(label)}"]:::${styleClass}`);

      // Attach function to its step (no chaining)
      const step = item.step;
      if (stepNodes[step]) {
        lines.push(`    ${stepNodes[step]} -.-> ${funcNodeId}`);
      }

      // Add action child nodes tied to this function
      if (item.swaigActions && item.swaigActions.length > 0) {
        item.swaigActions.forEach(action => {
          const actionNodeId = `A${nodeId++}`;
          const actionLabel = sanitizeLabel(action.label);
          const actionClass = action.nodeClass || 'actionNode';
          lines.push(`    ${actionNodeId}["${actionLabel}"]:::${actionClass}`);
          lines.push(`    ${funcNodeId} -.-> ${actionNodeId}`);

          // For navigation actions, draw a dashed edge to the target step node for clarity
          if ((action.verb === 'change_step' || action.verb === 'change_context') && action.data) {
            const targetStepId = stepNodes[String(action.data)];
            if (targetStepId) {
              lines.push(`    ${actionNodeId} -.-> ${targetStepId}`);
            }
          }
        });
      }

    } else if (item.type === 'function_error') {
      const errNodeId = `E${nodeId++}`;
      const errLabel = sanitizeLabel(`${item.functionName} ERROR${item.httpCode ? ` (${item.httpCode})` : ''}`);
      lines.push(`    ${errNodeId}["${errLabel}"]:::errorNode`);
      if (stepNodes[item.step]) {
        lines.push(`    ${stepNodes[item.step]} -.-> ${errNodeId}`);
      }

    } else if (item.type === 'context_enter') {
      const ctxNodeId = `CTX${nodeId++}`;
      const ctxLabel = item.toContext
        ? sanitizeLabel(`context → ${item.toContext}`)
        : 'context switch';
      lines.push(`    ${ctxNodeId}["${ctxLabel}"]:::navNode`);
      if (stepNodes[item.step]) {
        lines.push(`    ${stepNodes[item.step]} -.-> ${ctxNodeId}`);
      }

    } else if (item.type === 'reset') {
      const resetNodeId = `RST${nodeId++}`;
      const resetLabel = sanitizeLabel(item.resetType || 'reset');
      lines.push(`    ${resetNodeId}["${resetLabel}"]:::terminalNode`);
      if (stepNodes[item.step]) {
        lines.push(`    ${stepNodes[item.step]} -.-> ${resetNodeId}`);
      }
    }
  });

  return lines.join('\n');
}

function extractInterestingActions(actions) {
  if (!Array.isArray(actions)) return [];

  const result = [];

  actions.forEach(action => {
    if (!action || typeof action !== 'object') return;

    Object.entries(action).forEach(([verb, value]) => {

      // ── Navigation actions ─────────────────────────────────────────────
      if (verb === 'change_step') {
        const dest = value ? sanitizeLabel(String(value).substring(0, 30)) : '';
        result.push({ verb, label: dest ? `change_step → ${dest}` : 'change_step', data: value ?? null, nodeClass: 'navNode' });
        return;
      }

      if (verb === 'change_context') {
        const dest = value ? sanitizeLabel(String(value).substring(0, 30)) : '';
        result.push({ verb, label: dest ? `change_context → ${dest}` : 'change_context', data: value ?? null, nodeClass: 'navNode' });
        return;
      }

      if (verb === 'context_switch') {
        let label = 'context_switch';
        if (value && typeof value === 'object') {
          const prompt = value.system_prompt || value.system_pom || '';
          if (prompt) label += `<br/>${sanitizeLabel(String(prompt).substring(0, 30))}`;
        }
        result.push({ verb, label, data: value ?? null, nodeClass: 'navNode' });
        return;
      }

      // ── Terminal actions ───────────────────────────────────────────────
      if (verb === 'hangup' || verb === 'stop') {
        result.push({ verb, label: verb, data: value ?? null, nodeClass: 'terminalNode' });
        return;
      }

      if (verb === 'transfer') {
        let label = 'transfer';
        const dest = typeof value === 'string' ? value : (value?.dest || value?.to || null);
        if (dest) label += `<br/>${sanitizeLabel(String(dest).substring(0, 30))}`;
        result.push({ verb, label, data: value ?? null, nodeClass: 'terminalNode' });
        return;
      }

      // ── Data / state actions ───────────────────────────────────────────
      if (verb === 'set_global_data' && value && typeof value === 'object') {
        const keys = Object.keys(value);
        const keyList = keys.slice(0, 4).join(', ') + (keys.length > 4 ? ` +${keys.length - 4}` : '');
        result.push({ verb, label: `set_global_data<br/>${keyList}`, data: value, nodeClass: 'actionNode' });
        return;
      }

      if (verb === 'unset_global_data') {
        const keys = Array.isArray(value) ? value.join(', ') : String(value ?? '');
        result.push({ verb, label: `unset_global_data<br/>${sanitizeLabel(keys.substring(0, 40))}`, data: value ?? null, nodeClass: 'actionNode' });
        return;
      }

      if (verb === 'set_meta_data' && value && typeof value === 'object') {
        const keys = Object.keys(value).slice(0, 3).join(', ');
        result.push({ verb, label: `set_meta_data<br/>${keys}`, data: value, nodeClass: 'actionNode' });
        return;
      }

      if (verb === 'unset_meta_data') {
        const keys = Array.isArray(value) ? value.join(', ') : String(value ?? '');
        result.push({ verb, label: `unset_meta_data<br/>${sanitizeLabel(keys.substring(0, 40))}`, data: value ?? null, nodeClass: 'actionNode' });
        return;
      }

      if (verb === 'add_dynamic_hints' && Array.isArray(value)) {
        const preview = value.slice(0, 3).map(h => String(h).substring(0, 18)).join(', ')
          + (value.length > 3 ? ` +${value.length - 3}` : '');
        result.push({ verb, label: `add_hints<br/>${preview}`, data: value, nodeClass: 'actionNode' });
        return;
      }

      if (verb === 'clear_dynamic_hints') {
        result.push({ verb, label: 'clear_hints', data: value ?? null, nodeClass: 'actionNode' });
        return;
      }

      // ── Speech / media ─────────────────────────────────────────────────
      if (verb === 'say') {
        const text = typeof value === 'string' ? value : (value?.text || '');
        const preview = sanitizeLabel(String(text).substring(0, 35));
        result.push({ verb, label: preview ? `say<br/>${preview}` : 'say', data: value ?? null, nodeClass: 'actionNode' });
        return;
      }

      if (verb === 'playback_bg') {
        const file = typeof value === 'string' ? value : (value?.file || '');
        const preview = sanitizeLabel(String(file).substring(0, 30));
        result.push({ verb, label: preview ? `playback_bg<br/>${preview}` : 'playback_bg', data: value ?? null, nodeClass: 'actionNode' });
        return;
      }

      // ── Function control ───────────────────────────────────────────────
      if (verb === 'toggle_functions' && Array.isArray(value)) {
        const preview = value.slice(0, 3)
          .map(f => (f.active === false ? '−' : '+') + (f.function || '?'))
          .join(', ')
          + (value.length > 3 ? ` +${value.length - 3}` : '');
        result.push({ verb, label: `toggle_functions<br/>${sanitizeLabel(preview)}`, data: value, nodeClass: 'actionNode' });
        return;
      }

      // ── SWML sections ──────────────────────────────────────────────────
      if (verb === 'SWML' && value?.sections) {
        Object.entries(value.sections).forEach(([_section, steps]) => {
          if (!Array.isArray(steps)) return;
          steps.forEach(step => {
            if (!step || typeof step !== 'object') return;
            Object.entries(step).forEach(([swmlVerb, swmlArgs]) => {
              let label = swmlVerb;
              if (swmlArgs && typeof swmlArgs === 'object') {
                const interesting = ['to_number', 'from_number', 'url', 'body', 'name', 'method'];
                const parts = interesting
                  .filter(k => swmlArgs[k])
                  .map(k => {
                    const v = String(swmlArgs[k]);
                    return `${k}: ${v.length > 20 ? v.substring(0, 20) + '...' : v}`;
                  });
                if (parts.length > 0) label += `<br/>${parts.join('<br/>')}`;
              }
              result.push({ verb: swmlVerb, label, data: swmlArgs ?? null, nodeClass: 'actionNode' });
            });
          });
        });
        return;
      }

      // ── Generic fallback ───────────────────────────────────────────────
      let label = verb;
      if (value && typeof value === 'object') {
        const interesting = ['to_number', 'url', 'body', 'name', 'dest', 'timeout'];
        const parts = interesting
          .filter(k => value[k])
          .map(k => {
            const v = String(value[k]);
            return v.length > 25 ? v.substring(0, 25) + '...' : v;
          });
        if (parts.length > 0) label += `<br/>${parts.join('<br/>')}`;
      } else if (typeof value === 'string' && value.length > 0) {
        label += `<br/>${sanitizeLabel(value.substring(0, 30))}`;
      } else if (typeof value === 'number') {
        label += `: ${value}`;
      }
      result.push({ verb, label, data: value ?? null, nodeClass: 'actionNode' });
    });
  });

  return result;
}

function sanitizeLabel(text) {
  if (!text) return '';
  return String(text)
    .replace(/"/g, '#quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function extractFunctionDetails(data) {
  if (!data) return null;

  let parsed = data;

  // If it's a string, try to parse as JSON
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      // If not JSON, truncate the string
      return data.length > 30 ? data.substring(0, 30) + '...' : data;
    }
  }

  // If it's an object, extract the most relevant field
  if (typeof parsed === 'object' && parsed !== null) {
    // For gather_submit args, look for "answer" field
    if (parsed.answer !== undefined) {
      const answer = String(parsed.answer);
      return answer.length > 30 ? answer.substring(0, 30) + '...' : answer;
    }

    // For other objects, try to find a meaningful value
    const keys = Object.keys(parsed);
    if (keys.length > 0) {
      const firstValue = parsed[keys[0]];
      if (typeof firstValue === 'string' || typeof firstValue === 'number') {
        const val = String(firstValue);
        return val.length > 30 ? val.substring(0, 30) + '...' : val;
      }
    }

    // If object is complex, show truncated JSON
    const jsonStr = JSON.stringify(parsed);
    return jsonStr.length > 30 ? jsonStr.substring(0, 30) + '...' : jsonStr;
  }

  return null;
}

function formatJson(data) {
  if (!data) return '';
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
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

function parseJsonValue(data) {
  if (!data) return null;
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return data; }
  }
  return data;
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  return String(value);
}

function renderDataItems(data, parentKey = '') {
  if (data === null || data === undefined) {
    return `<div class="swaig-data-items"><div class="swaig-data-value-only">${formatValue(data)}</div></div>`;
  }
  if (Array.isArray(data)) {
    return `<div class="swaig-data-items">${data.map((item, idx) => {
      const itemKey = `${parentKey}[${idx}]`;
      return renderDataItem(idx, item, itemKey);
    }).join('')}</div>`;
  }
  if (typeof data === 'object') {
    return `<div class="swaig-data-items">${Object.entries(data).map(([key, value]) => {
      const itemKey = parentKey ? `${parentKey}.${key}` : key;
      return renderDataItem(key, value, itemKey);
    }).join('')}</div>`;
  }
  return `<div class="swaig-data-items"><div class="swaig-data-value-only">${escapeHtml(formatValue(data))}</div></div>`;
}

function renderDataItem(key, value, fullKey) {
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);
  const displayValue = isObject ? (isArray ? `Array[${value.length}]` : 'Object') : formatValue(value);
  const valueString = JSON.stringify(value, null, 2);
  return `
    <div class="swaig-data-item ${isObject ? 'has-nested' : ''}" data-key="${escapeHtml(fullKey || String(key))}">
      <div class="swaig-data-item-row">
        ${isObject ? '<span class="swaig-data-nested-toggle">&#x25B6;</span>' : '<span class="swaig-data-item-spacer"></span>'}
        <span class="swaig-data-item-key">${escapeHtml(String(key))}</span>
        <span class="swaig-data-item-value ${isObject ? 'is-object' : ''}">${escapeHtml(displayValue)}</span>
        <button class="swaig-data-item-copy" data-value="${escapeHtml(valueString)}" title="Copy value">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      ${isObject ? `<div class="swaig-data-item-nested">${renderDataItems(value, fullKey || String(key))}</div>` : ''}
    </div>`;
}

async function downloadSvgAsImage(svgElement, filename, title = 'State Flow Diagram', legendItems = []) {
  const BG = '#0f172a';
  const TITLE_PAD = 80; // room for title line + legend line below it

  // Clone SVG to avoid modifying the original
  const clonedSvg = svgElement.cloneNode(true);

  // Remove any pan/zoom transforms from the main group to get true dimensions
  const g = clonedSvg.querySelector('g');
  if (g) {
    g.removeAttribute('transform');
  }

  // Make edge paths visible
  const allPaths = clonedSvg.querySelectorAll('path');
  allPaths.forEach(path => {
    const currentStroke = path.getAttribute('stroke');
    if (currentStroke && currentStroke !== 'none') {
      path.setAttribute('stroke', '#4b5563');
      path.setAttribute('stroke-width', '2');
    }
  });

  // Make all text legible
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
  const padding = 40;
  const vx = bbox.x - padding / 2;
  const vy = bbox.y - padding / 2;
  const width = Math.ceil(bbox.width + padding);
  const height = Math.ceil(bbox.height + padding);
  const totalHeight = height + TITLE_PAD;

  document.body.removeChild(tempDiv);

  // Extend viewBox: TITLE_PAD above the diagram holds title + legend
  clonedSvg.setAttribute('width', width);
  clonedSvg.setAttribute('height', totalHeight);
  clonedSvg.setAttribute('viewBox', `${vx} ${vy - TITLE_PAD} ${width} ${totalHeight}`);

  // Background covering the full extended area
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', vx);
  bgRect.setAttribute('y', vy - TITLE_PAD);
  bgRect.setAttribute('width', width);
  bgRect.setAttribute('height', totalHeight);
  bgRect.setAttribute('fill', BG);
  clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

  // Title — top-left of the header band
  const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  titleEl.setAttribute('x', vx + 20);
  titleEl.setAttribute('y', vy - TITLE_PAD + 28);
  titleEl.setAttribute('fill', '#e5e7eb');
  titleEl.setAttribute('font-size', '18');
  titleEl.setAttribute('font-weight', 'bold');
  titleEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
  titleEl.textContent = title;
  clonedSvg.appendChild(titleEl);

  // Legend — upper-right, on the line below the title
  if (legendItems.length > 0) {
    const ITEM_BOX = 18, BOX_GAP = 8, ITEM_GAP = 20, CHAR_W = 7.5;
    const totalLegendW = legendItems.reduce((sum, item, i) =>
      sum + ITEM_BOX + BOX_GAP + item.label.length * CHAR_W + (i < legendItems.length - 1 ? ITEM_GAP : 0), 0);
    let lx = vx + width - totalLegendW - 20;
    const ly = vy - TITLE_PAD + 58;
    legendItems.forEach(item => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', lx); r.setAttribute('y', ly - 12);
      r.setAttribute('width', ITEM_BOX); r.setAttribute('height', ITEM_BOX);
      r.setAttribute('fill', item.color); r.setAttribute('stroke', item.stroke);
      r.setAttribute('stroke-width', '1.5'); r.setAttribute('rx', '3');
      clonedSvg.appendChild(r);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', lx + ITEM_BOX + BOX_GAP); t.setAttribute('y', ly + 2);
      t.setAttribute('fill', '#9ca3af'); t.setAttribute('font-size', '13');
      t.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      t.textContent = item.label;
      clonedSvg.appendChild(t);
      lx += ITEM_BOX + BOX_GAP + item.label.length * CHAR_W + ITEM_GAP;
    });
  }

  // Serialize SVG to string and encode as data URI
  const svgString = new XMLSerializer().serializeToString(clonedSvg);
  const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));

  // Create image from SVG data URI
  const img = new Image();
  img.width = width;
  img.height = totalHeight;

  return new Promise((resolve, reject) => {
    img.onload = () => {
      try {
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // 2x for better quality
        canvas.height = totalHeight * 2;
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
