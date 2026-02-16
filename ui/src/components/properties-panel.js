import { getState, update, deleteStep, deleteFunction } from '../lib/state.js';
import { refreshCanvas } from './canvas.js';

export function renderPropertiesPanel(container) {
  const state = getState();
  const { selectedNodeId, selectedNodeType } = state.ui;

  if (!selectedNodeId) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👈</div>
        <div class="empty-state-title">No selection</div>
        <div class="empty-state-desc">
          Click a node on the canvas or drag one from the sidebar to get started
        </div>
      </div>
    `;
    return;
  }

  if (selectedNodeType === 'step') {
    renderStepProperties(container, selectedNodeId);
  } else if (selectedNodeType === 'function') {
    renderFunctionProperties(container, selectedNodeId);
  }
}

function renderStepProperties(container, stepId) {
  const state = getState();

  // Find the step
  let step = null;
  let contextId = null;
  for (const cId in state.contexts) {
    if (state.contexts[cId].steps[stepId]) {
      step = state.contexts[cId].steps[stepId];
      contextId = cId;
      break;
    }
  }

  if (!step) return;

  container.innerHTML = `
    <div class="properties-header">
      <div class="properties-title">Step: ${step.name}</div>
      <div class="properties-subtitle">Context: ${state.contexts[contextId].name}</div>
    </div>

    <div class="properties-body">
      <div class="properties-section">
        <div class="properties-section-title">Basic Info</div>

        <div class="form-group">
          <label for="step-name">Step Name</label>
          <input type="text" id="step-name" value="${step.name}" />
        </div>

        <div class="form-group">
          <label for="step-criteria">Step Criteria</label>
          <textarea id="step-criteria" placeholder="When is this step considered complete?">${step.criteria || ''}</textarea>
        </div>
      </div>

      <div class="properties-section">
        <div class="properties-section-title">Instructions (POM)</div>

        <div class="list-editor" id="instructions-list">
          ${step.instructions.map((section, idx) => renderPOMSection(section, idx)).join('')}
        </div>

        <button class="btn-secondary btn-add" id="add-instruction-btn">
          ➕ Add Section
        </button>
      </div>

      <div class="properties-section">
        <div class="properties-section-title">Available Functions</div>

        <div class="form-group">
          <select id="step-functions" multiple size="5">
            <option value="none" ${step.functions.length === 0 || step.functions.includes('none') ? 'selected' : ''}>none</option>
            ${Object.values(state.functions).map(func => `
              <option value="${func.id}" ${step.functions.includes(func.id) ? 'selected' : ''}>
                ${func.name}
              </option>
            `).join('')}
          </select>
          <small style="color: var(--text-muted)">Hold Ctrl/Cmd to select multiple</small>
        </div>
      </div>

      <div class="properties-section">
        <div class="properties-section-title">Valid Next Steps</div>

        <div class="form-group">
          <select id="step-valid-steps" multiple size="5">
            ${getAvailableSteps(contextId, stepId).map(s => `
              <option value="${s.id}" ${step.validSteps.includes(s.id) ? 'selected' : ''}>
                ${s.name}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="properties-section">
        <button class="btn-secondary" style="width: 100%; color: var(--accent-red);" id="delete-step-btn">
          🗑️ Delete Step
        </button>
      </div>
    </div>
  `;

  attachStepEventListeners(step, contextId);
}

function renderPOMSection(section, idx) {
  return `
    <div class="list-item" data-index="${idx}">
      <div class="list-item-content">
        <input type="text" placeholder="Section title" value="${section.title || ''}" class="pom-title" />
        ${section.bullets ? `
          <div class="form-group" style="margin-top: var(--spacing-sm);">
            <textarea placeholder="Bullet points (one per line)" class="pom-bullets">${section.bullets.join('\n')}</textarea>
          </div>
        ` : `
          <div class="form-group" style="margin-top: var(--spacing-sm);">
            <textarea placeholder="Section body" class="pom-body">${section.body || ''}</textarea>
          </div>
        `}
      </div>
      <div class="list-item-actions">
        <button class="btn-icon btn-ghost pom-remove" data-index="${idx}">🗑️</button>
      </div>
    </div>
  `;
}

function attachStepEventListeners(step, contextId) {
  // Step name
  document.getElementById('step-name')?.addEventListener('input', (e) => {
    const newContexts = { ...getState().contexts };
    newContexts[contextId].steps[step.id].name = e.target.value;
    update({ contexts: newContexts });
    refreshCanvas();
  });

  // Step criteria
  document.getElementById('step-criteria')?.addEventListener('input', (e) => {
    const newContexts = { ...getState().contexts };
    newContexts[contextId].steps[step.id].criteria = e.target.value;
    update({ contexts: newContexts });
  });

  // Functions
  document.getElementById('step-functions')?.addEventListener('change', (e) => {
    const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
    const newContexts = { ...getState().contexts };
    newContexts[contextId].steps[step.id].functions = selected;
    update({ contexts: newContexts });
    refreshCanvas();
  });

  // Valid steps
  document.getElementById('step-valid-steps')?.addEventListener('change', (e) => {
    const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
    const newContexts = { ...getState().contexts };
    newContexts[contextId].steps[step.id].validSteps = selected;
    update({ contexts: newContexts });
    refreshCanvas();
  });

  // Add instruction
  document.getElementById('add-instruction-btn')?.addEventListener('click', () => {
    const newContexts = { ...getState().contexts };
    if (!newContexts[contextId].steps[step.id].instructions) {
      newContexts[contextId].steps[step.id].instructions = [];
    }
    newContexts[contextId].steps[step.id].instructions.push({
      title: '',
      body: ''
    });
    update({ contexts: newContexts });
    renderPropertiesPanel(document.getElementById('properties-panel'));
  });

  // Delete step
  document.getElementById('delete-step-btn')?.addEventListener('click', () => {
    if (confirm(`Delete step "${step.name}"?`)) {
      deleteStep(step.id);
      refreshCanvas();
      renderPropertiesPanel(document.getElementById('properties-panel'));
    }
  });
}

function renderFunctionProperties(container, funcId) {
  const state = getState();
  const func = state.functions[funcId];

  if (!func) return;

  container.innerHTML = `
    <div class="properties-header">
      <div class="properties-title">Function: ${func.name}</div>
      <div class="properties-subtitle">SWAIG Tool</div>
    </div>

    <div class="properties-body">
      <div class="properties-section">
        <div class="properties-section-title">Basic Info</div>

        <div class="form-group">
          <label for="func-name">Function Name</label>
          <input type="text" id="func-name" value="${func.name}" />
        </div>

        <div class="form-group">
          <label for="func-purpose">Purpose</label>
          <textarea id="func-purpose" placeholder="What does this function do?">${func.purpose || ''}</textarea>
        </div>

        <div class="form-group">
          <label for="func-url">Webhook URL</label>
          <input type="text" id="func-url" value="${func.webHookUrl || ''}" placeholder="https://..." />
        </div>
      </div>

      <div class="properties-section">
        <div class="properties-section-title">Parameters</div>

        <div class="list-editor" id="params-list">
          ${(func.parameters || []).map((param, idx) => renderParameter(param, idx)).join('')}
        </div>

        <button class="btn-secondary btn-add" id="add-param-btn">
          ➕ Add Parameter
        </button>
      </div>

      <div class="properties-section">
        <button class="btn-secondary" style="width: 100%; color: var(--accent-red);" id="delete-function-btn">
          🗑️ Delete Function
        </button>
      </div>
    </div>
  `;

  attachFunctionEventListeners(func);
}

function renderParameter(param, idx) {
  return `
    <div class="list-item" data-index="${idx}">
      <div class="list-item-content">
        <input type="text" placeholder="Parameter name" value="${param.name || ''}" class="param-name" />
        <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
          <select class="param-type" style="flex: 1;">
            <option value="string" ${param.type === 'string' ? 'selected' : ''}>string</option>
            <option value="number" ${param.type === 'number' ? 'selected' : ''}>number</option>
            <option value="boolean" ${param.type === 'boolean' ? 'selected' : ''}>boolean</option>
            <option value="array" ${param.type === 'array' ? 'selected' : ''}>array</option>
            <option value="object" ${param.type === 'object' ? 'selected' : ''}>object</option>
          </select>
          <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
            <input type="checkbox" class="param-required" ${param.required ? 'checked' : ''} />
            Required
          </label>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn-icon btn-ghost param-remove" data-index="${idx}">🗑️</button>
      </div>
    </div>
  `;
}

function attachFunctionEventListeners(func) {
  // Function name
  document.getElementById('func-name')?.addEventListener('input', (e) => {
    const newFunctions = { ...getState().functions };
    newFunctions[func.id].name = e.target.value;
    update({ functions: newFunctions });
    refreshCanvas();
  });

  // Purpose
  document.getElementById('func-purpose')?.addEventListener('input', (e) => {
    const newFunctions = { ...getState().functions };
    newFunctions[func.id].purpose = e.target.value;
    update({ functions: newFunctions });
  });

  // Webhook URL
  document.getElementById('func-url')?.addEventListener('input', (e) => {
    const newFunctions = { ...getState().functions };
    newFunctions[func.id].webHookUrl = e.target.value;
    update({ functions: newFunctions });
  });

  // Add parameter
  document.getElementById('add-param-btn')?.addEventListener('click', () => {
    const newFunctions = { ...getState().functions };
    if (!newFunctions[func.id].parameters) {
      newFunctions[func.id].parameters = [];
    }
    newFunctions[func.id].parameters.push({
      name: '',
      type: 'string',
      required: false
    });
    update({ functions: newFunctions });
    renderPropertiesPanel(document.getElementById('properties-panel'));
  });

  // Delete function
  document.getElementById('delete-function-btn')?.addEventListener('click', () => {
    if (confirm(`Delete function "${func.name}"?`)) {
      deleteFunction(func.id);
      refreshCanvas();
      renderPropertiesPanel(document.getElementById('properties-panel'));
    }
  });
}

function getAvailableSteps(contextId, excludeStepId) {
  const state = getState();
  const steps = [];

  // Get steps from same context
  const context = state.contexts[contextId];
  Object.values(context.steps).forEach(step => {
    if (step.id !== excludeStepId) {
      steps.push(step);
    }
  });

  return steps;
}
