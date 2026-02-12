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

const app = document.getElementById('app');

const BASE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'charts', label: 'Charts' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'swaig', label: 'SWAIG Inspector' },
  { id: 'post-prompt', label: 'Post-Prompt' },
  { id: 'recording', label: 'Recording' },
  { id: 'global-data', label: 'Global Data' },
];

function getTabs(payload) {
  return BASE_TABS;
}

function render(state) {
  if (!state.payload) {
    mountDropZone(app);
    return;
  }

  const { payload, metrics, activeTab } = state;
  const tabs = getTabs(payload);

  app.innerHTML = `
    <div id="header-container"></div>
    <div id="tabs-container"></div>
    <div id="content-container"></div>
  `;

  // Header
  renderHeader(document.getElementById('header-container'), payload, metrics);

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
    case 'recording':
      renderRecording(content, payload);
      break;
    case 'global-data':
      renderGlobalData(content, payload);
      break;
  }
}

subscribe(render);
render(getState());
