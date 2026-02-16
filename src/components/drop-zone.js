import { parsePayload, computeMetrics } from '../../lib/index.js';
import { update } from '../state.js';

export function mountDropZone(container) {
  container.innerHTML = `
    <div class="drop-zone">
      <div class="drop-zone__header">
        <a href="https://github.com/signalwire-demos/postpromptviewer" target="_blank" rel="noopener" class="drop-zone__github-link">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
          <span>GitHub</span>
        </a>
      </div>
      <div class="drop-zone__grid">
        <div class="drop-zone__column">
          <div class="drop-zone__area" id="swml-drop">
            <div class="drop-zone__icon">⚙️</div>
            <div class="drop-zone__title">SWML Inspector</div>
            <div class="drop-zone__subtitle">Drop a SWML configuration JSON file here</div>
            <div class="drop-zone__buttons">
              <button class="drop-zone__btn" id="swml-btn">
                <span>📁</span>
                <span>Browse Files</span>
              </button>
              <button class="drop-zone__btn drop-zone__btn--secondary" id="swml-example-btn">
                <span>✨</span>
                <span>Load Example</span>
              </button>
            </div>
            <input type="file" id="swml-input" accept=".json" style="display:none" />
          </div>
          <div class="drop-zone__hint">Inspect AI prompts, steps, functions, and configuration</div>
        </div>

        <div class="drop-zone__column">
          <div class="drop-zone__area" id="postprompt-drop">
            <div class="drop-zone__icon">📊</div>
            <div class="drop-zone__title">Post-Prompt Viewer</div>
            <div class="drop-zone__subtitle">Drop a post_conversation JSON file here</div>
            <div class="drop-zone__buttons">
              <button class="drop-zone__btn" id="postprompt-btn">
                <span>📁</span>
                <span>Browse Files</span>
              </button>
              <button class="drop-zone__btn drop-zone__btn--secondary" id="postprompt-example-btn">
                <span>✨</span>
                <span>Load Example</span>
              </button>
            </div>
            <input type="file" id="postprompt-input" accept=".json" style="display:none" />
          </div>
          <div class="drop-zone__hint">Analyze call metrics, transcripts, and performance data</div>
        </div>
      </div>
      <div id="drop-zone-error" class="drop-zone__error"></div>
    </div>
  `;

  const postPromptArea = container.querySelector('#postprompt-drop');
  const postPromptBtn = container.querySelector('#postprompt-btn');
  const postPromptInput = container.querySelector('#postprompt-input');
  const postPromptExampleBtn = container.querySelector('#postprompt-example-btn');

  const swmlArea = container.querySelector('#swml-drop');
  const swmlBtn = container.querySelector('#swml-btn');
  const swmlInput = container.querySelector('#swml-input');
  const swmlExampleBtn = container.querySelector('#swml-example-btn');

  const errorDiv = container.querySelector('#drop-zone-error');

  function showError(msg) {
    errorDiv.textContent = msg;
    setTimeout(() => { errorDiv.textContent = ''; }, 5000);
  }

  // Post-Prompt handlers
  postPromptBtn.addEventListener('click', () => postPromptInput.click());
  postPromptInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handlePostPromptFile(file);
  });

  postPromptArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    postPromptArea.classList.add('drag-over');
  });
  postPromptArea.addEventListener('dragleave', () => {
    postPromptArea.classList.remove('drag-over');
  });
  postPromptArea.addEventListener('drop', (e) => {
    e.preventDefault();
    postPromptArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handlePostPromptFile(file);
  });

  // SWML handlers
  swmlBtn.addEventListener('click', () => swmlInput.click());
  swmlInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleSwmlFile(file);
  });

  swmlArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    swmlArea.classList.add('drag-over');
  });
  swmlArea.addEventListener('dragleave', () => {
    swmlArea.classList.remove('drag-over');
  });
  swmlArea.addEventListener('drop', (e) => {
    e.preventDefault();
    swmlArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleSwmlFile(file);
  });

  function handlePostPromptFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target.result);
        const payload = parsePayload(raw);
        const metrics = computeMetrics(payload);
        update({ payload, metrics, activeTab: 'dashboard', viewMode: 'postprompt' });
      } catch (err) {
        showError(`Failed to parse post-prompt file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  function handleSwmlFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const swml = JSON.parse(e.target.result);
        // Basic validation
        if (!swml.sections || !swml.sections.main) {
          throw new Error('Invalid SWML file: missing sections.main');
        }
        update({ swml, activeTab: 'swml-overview', viewMode: 'swml' });
      } catch (err) {
        showError(`Failed to parse SWML file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // Example button handlers
  postPromptExampleBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('/examples/call.json');
      if (!response.ok) throw new Error('Failed to load example');
      const raw = await response.json();
      const payload = parsePayload(raw);
      const metrics = computeMetrics(payload);
      update({ payload, metrics, activeTab: 'dashboard', viewMode: 'postprompt' });
    } catch (err) {
      showError(`Failed to load example: ${err.message}`);
    }
  });

  swmlExampleBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('/examples/voyager.json');
      if (!response.ok) throw new Error('Failed to load example');
      const swml = await response.json();
      // Basic validation
      if (!swml.sections || !swml.sections.main) {
        throw new Error('Invalid SWML file: missing sections.main');
      }
      update({ swml, activeTab: 'swml-overview', viewMode: 'swml' });
    } catch (err) {
      showError(`Failed to load example: ${err.message}`);
    }
  });
}
