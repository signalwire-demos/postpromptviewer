import { subscribe, getState, update } from './state.js';
import { mountDropZone } from './components/drop-zone.js';
import { renderHeader } from './components/header.js';
import { renderDashboard } from './components/dashboard.js';
import { renderCharts } from './components/charts.js';
import { renderTimeline } from './components/timeline.js';
import { renderTranscript } from './components/transcript.js';
import { renderSwaigInspector } from './components/swaig-inspector.js';
import { renderPostPrompt } from './components/post-prompt.js';
import { renderGlobalData } from './components/global-data.js';
import { renderRecording } from './components/recording.js';
import { renderSwmlOverview } from './components/swml-overview.js';
import { renderSwmlPrompts } from './components/swml-prompts.js';
import { renderSwmlFunctions } from './components/swml-functions.js';
import { renderSwmlConfig } from './components/swml-config.js';
import { renderStateFlow } from './components/state-flow.js';

const app = document.getElementById('app');

const POSTPROMPT_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'charts', label: 'Charts' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'swaig', label: 'SWAIG Inspector' },
  { id: 'post-prompt', label: 'Post-Prompt' },
  { id: 'state-flow', label: 'State Flow' },
  { id: 'recording', label: 'Recording' },
  { id: 'global-data', label: 'Global Data' },
];

const SWML_TABS = [
  { id: 'swml-overview', label: 'Overview' },
  { id: 'swml-prompts', label: 'Prompts & Steps' },
  { id: 'swml-functions', label: 'Functions' },
  { id: 'swml-config', label: 'Configuration' },
];

function getTabs(viewMode) {
  if (viewMode === 'swml') return SWML_TABS;
  if (viewMode === 'postprompt') return POSTPROMPT_TABS;
  return [];
}

function render(state) {
  if (!state.payload && !state.swml) {
    mountDropZone(app);
    return;
  }

  const { payload, metrics, swml, activeTab, viewMode } = state;
  const tabs = getTabs(viewMode);

  app.innerHTML = `
    <div id="header-container"></div>
    <div id="tabs-container"></div>
    <div id="content-container"></div>
  `;

  // Header (only for post-prompt view)
  if (viewMode === 'postprompt') {
    renderHeader(document.getElementById('header-container'), payload, metrics);
  } else if (viewMode === 'swml') {
    document.getElementById('header-container').innerHTML = `
      <div class="header">
        <button class="header__back" id="back-btn">← Upload New File</button>
        <div style="display:flex;align-items:center;gap:1rem">
          <span style="font-size:1.5rem">⚙️</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">SWML Inspector</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">SignalWire Markup Language Configuration</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => {
      update({ swml: null, payload: null, viewMode: null, activeTab: 'dashboard' });
    });
  }

  // Tabs
  const tabsContainer = document.getElementById('tabs-container');
  tabsContainer.innerHTML = `
    <div class="tabs">
      ${tabs.map(t =>
        `<button class="tab${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
      ).join('')}
    </div>
  `;
  tabsContainer.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      update({ activeTab: btn.dataset.tab });
    });
  });

  // Content
  const content = document.getElementById('content-container');

  if (viewMode === 'postprompt') {
    switch (activeTab) {
      case 'dashboard':
        renderDashboard(content, metrics);
        break;
      case 'charts':
        renderCharts(content, payload, metrics);
        break;
      case 'timeline':
        renderTimeline(content, payload, metrics);
        break;
      case 'transcript':
        renderTranscript(content, payload);
        break;
      case 'swaig':
        renderSwaigInspector(content, payload);
        break;
      case 'post-prompt':
        renderPostPrompt(content, payload);
        break;
      case 'state-flow':
        renderStateFlow(content, payload);
        break;
      case 'recording':
        renderRecording(content, payload);
        break;
      case 'global-data':
        renderGlobalData(content, payload);
        break;
    }
  } else if (viewMode === 'swml') {
    switch (activeTab) {
      case 'swml-overview':
        renderSwmlOverview(content, swml);
        break;
      case 'swml-prompts':
        renderSwmlPrompts(content, swml);
        break;
      case 'swml-functions':
        renderSwmlFunctions(content, swml);
        break;
      case 'swml-config':
        renderSwmlConfig(content, swml);
        break;
    }
  }
}

subscribe(render);
render(getState());
