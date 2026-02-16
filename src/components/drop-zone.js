import { parsePayload, computeMetrics } from '../../lib/index.js';
import { update } from '../state.js';

export function mountDropZone(container) {
  container.innerHTML = `
    <div class="drop-zone">
      <div class="drop-zone__grid">
        <div class="drop-zone__column">
          <div class="drop-zone__area" id="swml-drop">
            <div class="drop-zone__icon">⚙️</div>
            <div class="drop-zone__title">SWML Inspector</div>
            <div class="drop-zone__subtitle">Drop a SWML configuration JSON file here</div>
            <button class="drop-zone__btn" id="swml-btn">
              <span>📁</span>
              <span>Browse Files</span>
            </button>
            <input type="file" id="swml-input" accept=".json" style="display:none" />
          </div>
          <div class="drop-zone__hint">Inspect AI prompts, steps, functions, and configuration</div>
        </div>

        <div class="drop-zone__column">
          <div class="drop-zone__area" id="postprompt-drop">
            <div class="drop-zone__icon">📊</div>
            <div class="drop-zone__title">Post-Prompt Viewer</div>
            <div class="drop-zone__subtitle">Drop a post_conversation JSON file here</div>
            <button class="drop-zone__btn" id="postprompt-btn">
              <span>📁</span>
              <span>Browse Files</span>
            </button>
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

  const swmlArea = container.querySelector('#swml-drop');
  const swmlBtn = container.querySelector('#swml-btn');
  const swmlInput = container.querySelector('#swml-input');

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
}
