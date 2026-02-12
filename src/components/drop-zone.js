import { parsePayload, computeMetrics } from '../../lib/index.js';
import { update } from '../state.js';

export function mountDropZone(container) {
  container.innerHTML = `
    <div class="drop-zone" id="drop-zone">
      <div class="drop-zone__area" id="drop-area">
        <div class="drop-zone__icon">&#x1F4C4;</div>
        <div class="drop-zone__title">Post-Prompt Observability Viewer</div>
        <div class="drop-zone__subtitle">
          Drop a post-conversation JSON file here, or click to browse
        </div>
        <button class="drop-zone__btn" id="browse-btn">Choose File</button>
        <input type="file" id="file-input" accept=".json" hidden />
        <div class="drop-zone__error" id="drop-error"></div>
      </div>
    </div>
  `;

  const area = document.getElementById('drop-area');
  const input = document.getElementById('file-input');
  const btn = document.getElementById('browse-btn');
  const errorEl = document.getElementById('drop-error');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    input.click();
  });
  area.addEventListener('click', () => input.click());

  input.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0], errorEl);
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('drag-over');
  });
  area.addEventListener('dragleave', () => {
    area.classList.remove('drag-over');
  });
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], errorEl);
  });
}

async function handleFile(file, errorEl) {
  errorEl.textContent = '';
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const payload = parsePayload(raw);
    const metrics = computeMetrics(payload);
    update({ payload, metrics, activeTab: 'dashboard' });
  } catch (err) {
    errorEl.textContent = `Error: ${err.message}`;
  }
}
