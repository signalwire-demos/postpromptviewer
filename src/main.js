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
import { renderRecordBrowser } from './components/record-browser.js';

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

function getTabs(viewMode, payload) {
  if (viewMode === 'swml') return SWML_TABS;
  if (viewMode === 'postprompt') {
    if (!payload?.recordCallUrl) {
      return POSTPROMPT_TABS.filter(t => t.id !== 'recording');
    }
    return POSTPROMPT_TABS;
  }
  return [];
}

function render(state) {
  if (!state.payload && !state.swml) {
    if (state.browseMode) {
      renderRecordBrowser(app);
      return;
    }
    mountDropZone(app);
    return;
  }

  const { payload, metrics, swml, activeTab, viewMode } = state;
  const tabs = getTabs(viewMode, payload);

  app.innerHTML = `
    <div id="header-container"></div>
    <div id="tabs-container"></div>
    <div id="content-container" class="flex-1"></div>
  `;

  // Header (only for post-prompt view)
  if (viewMode === 'postprompt') {
    renderHeader(document.getElementById('header-container'), payload, metrics);
  } else if (viewMode === 'swml') {
    document.getElementById('header-container').innerHTML = `
      <div class="navbar bg-base-200 border-b border-base-300 px-4 gap-3 min-h-fit py-2">
        <button class="btn btn-ghost btn-sm" id="back-btn">&#x2190; Upload New File</button>
        <div class="flex items-center gap-3">
          <span class="text-2xl">&#x2699;&#xFE0F;</span>
          <div>
            <div class="font-semibold">SWML Inspector</div>
            <div class="text-xs opacity-50">SignalWire Markup Language Configuration</div>
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
    <div class="bg-base-200 border-b border-base-300 px-4">
      <div role="tablist" class="tabs tabs-border">
        ${tabs.map(t =>
          `<a role="tab" class="tab ${t.id === activeTab ? 'tab-active' : ''}" data-tab="${t.id}">${t.label}</a>`
        ).join('')}
      </div>
    </div>
  `;
  tabsContainer.querySelectorAll('[role="tab"]').forEach(btn => {
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
