import { getState, update } from '../lib/state.js';
import { exportSWML, exportPythonSDK } from '../lib/export.js';
import { importSWML } from '../lib/import.js';

export function renderToolbar(container) {
  const state = getState();

  container.innerHTML = `
    <div class="toolbar-section">
      <input
        type="text"
        id="agent-name-input"
        value="${state.agent.name}"
        placeholder="Agent Name"
      />
    </div>

    <div class="toolbar-section">
      <select id="context-select" class="btn-secondary">
        ${Object.values(state.contexts).map(ctx => `
          <option value="${ctx.id}" ${ctx.id === state.ui.activeContextId ? 'selected' : ''}>
            ${ctx.name}
          </option>
        `).join('')}
      </select>
      <button class="btn-ghost" id="add-context-btn" title="Add Context">
        ➕ Context
      </button>
    </div>

    <div class="toolbar-section">
      <div class="dropdown">
        <button class="btn-secondary" id="actions-btn">
          Actions ▾
        </button>
        <div class="dropdown-content">
          <div class="dropdown-item" data-action="new">
            🆕 New Agent
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" data-action="import-swml">
            📥 Import SWML JSON
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" data-action="export-swml">
            📤 Export SWML JSON
          </div>
          <div class="dropdown-item" data-action="export-sdk">
            🐍 Export Python SDK
          </div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-item" data-action="validate">
            ✅ Validate Agent
          </div>
          <div class="dropdown-item" data-action="settings">
            ⚙️ Agent Settings
          </div>
        </div>
      </div>
    </div>

    <div class="toolbar-section">
      <span class="badge badge-primary" id="node-count">
        0 steps
      </span>
      <span class="badge badge-success" id="function-count">
        0 functions
      </span>
    </div>
  `;

  // Event listeners
  const nameInput = container.querySelector('#agent-name-input');
  nameInput.addEventListener('input', (e) => {
    update({
      agent: {
        ...state.agent,
        name: e.target.value
      }
    });
  });

  const contextSelect = container.querySelector('#context-select');
  contextSelect.addEventListener('change', (e) => {
    update({
      ui: {
        ...state.ui,
        activeContextId: e.target.value
      }
    });
  });

  const actionsBtn = container.querySelector('#actions-btn');
  const dropdown = actionsBtn.parentElement;
  actionsBtn.addEventListener('click', () => {
    dropdown.classList.toggle('active');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  // Action menu items
  container.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      handleAction(action);
      dropdown.classList.remove('active');
    });
  });

  updateCounts();
}

function updateCounts() {
  const state = getState();

  let stepCount = 0;
  Object.values(state.contexts).forEach(ctx => {
    stepCount += Object.keys(ctx.steps).length;
  });

  const funcCount = Object.keys(state.functions).length;

  const nodeCountEl = document.getElementById('node-count');
  const funcCountEl = document.getElementById('function-count');

  if (nodeCountEl) nodeCountEl.textContent = `${stepCount} step${stepCount !== 1 ? 's' : ''}`;
  if (funcCountEl) funcCountEl.textContent = `${funcCount} function${funcCount !== 1 ? 's' : ''}`;
}

function handleAction(action) {
  switch (action) {
    case 'new':
      if (confirm('Create a new agent? Current work will be lost.')) {
        location.reload();
      }
      break;

    case 'import-swml':
      importSWML();
      break;

    case 'export-swml':
      exportSWML();
      break;

    case 'export-sdk':
      exportPythonSDK();
      break;

    case 'validate':
      // TODO: Implement validation
      alert('Validation coming soon!');
      break;

    case 'settings':
      // TODO: Open settings modal
      alert('Settings panel coming soon!');
      break;
  }
}

export function refreshToolbar() {
  const container = document.getElementById('toolbar');
  if (container) {
    renderToolbar(container);
  }
}
