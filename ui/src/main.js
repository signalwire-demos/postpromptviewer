import { subscribe } from './lib/state.js';
import { renderToolbar, refreshToolbar } from './components/toolbar.js';
import { renderSidebar } from './components/sidebar.js';
import { initCanvas, refreshCanvas } from './components/canvas.js';
import { renderPropertiesPanel } from './components/properties-panel.js';

function main() {
  console.log('🚀 SignalWire Agent Builder starting...');

  const toolbar = document.getElementById('toolbar');
  const sidebar = document.getElementById('sidebar');
  const canvasContainer = document.getElementById('canvas-container');
  const propertiesPanel = document.getElementById('properties-panel');

  // Create canvas element
  const canvas = document.createElement('div');
  canvas.id = 'canvas';
  canvasContainer.appendChild(canvas);

  // Initialize components
  renderToolbar(toolbar);
  renderSidebar(sidebar);
  initCanvas(canvas);
  renderPropertiesPanel(propertiesPanel);

  // Subscribe to state changes
  subscribe((state) => {
    refreshToolbar();
    refreshCanvas();
    renderPropertiesPanel(propertiesPanel);
  });

  console.log('✅ Agent Builder ready!');
}

// Start the app
main();
