export function renderSidebar(container) {
  container.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-section-title">Steps</div>
      <div class="node-palette">
        <div class="palette-item" draggable="true" data-node-type="step-basic">
          <div class="palette-item-icon">🔷</div>
          <div class="palette-item-content">
            <div class="palette-item-name">Basic Step</div>
            <div class="palette-item-desc">Conversation state with instructions</div>
          </div>
        </div>

        <div class="palette-item" draggable="true" data-node-type="step-gatherer">
          <div class="palette-item-icon">📝</div>
          <div class="palette-item-content">
            <div class="palette-item-name">Info Gatherer</div>
            <div class="palette-item-desc">Collect data with questions</div>
          </div>
        </div>

        <div class="palette-item" draggable="true" data-node-type="step-end">
          <div class="palette-item-icon">🔴</div>
          <div class="palette-item-content">
            <div class="palette-item-name">End Step</div>
            <div class="palette-item-desc">Conversation termination</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-section-title">Functions</div>
      <div class="node-palette">
        <div class="palette-item" draggable="true" data-node-type="function-custom">
          <div class="palette-item-icon">⚙️</div>
          <div class="palette-item-content">
            <div class="palette-item-name">Custom Function</div>
            <div class="palette-item-desc">Define SWAIG tool</div>
          </div>
        </div>

        <div class="palette-item" draggable="true" data-node-type="function-skill">
          <div class="palette-item-icon">🔌</div>
          <div class="palette-item-content">
            <div class="palette-item-name">Skill Function</div>
            <div class="palette-item-desc">Pre-built capability</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-section-title">Contexts</div>
      <div class="node-palette">
        <div class="palette-item" draggable="true" data-node-type="context">
          <div class="palette-item-icon">📦</div>
          <div class="palette-item-content">
            <div class="palette-item-name">New Context</div>
            <div class="palette-item-desc">Isolated conversation mode</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add drag event listeners
  container.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('nodeType', item.dataset.nodeType);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}
