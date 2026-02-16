import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { getState, addStep, addFunction, selectNode, deselectNode } from '../lib/state.js';

cytoscape.use(dagre);

let cy = null;

export function initCanvas(container) {
  cy = cytoscape({
    container,

    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#242b42',
          'border-width': 2,
          'border-color': '#3b82f6',
          'label': 'data(label)',
          'color': '#e2e8f0',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-weight': '500',
          'width': 160,
          'height': 60,
          'shape': 'roundrectangle'
        }
      },
      {
        selector: 'node[type="step"]',
        style: {
          'background-color': '#1a1f35',
          'border-color': 'data(contextColor)'
        }
      },
      {
        selector: 'node[type="function"]',
        style: {
          'background-color': '#1a1f35',
          'border-color': '#8b5cf6',
          'shape': 'hexagon',
          'width': 140,
          'height': 70
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 3,
          'border-color': '#10b981'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#3b82f6',
          'target-arrow-color': '#3b82f6',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.5
        }
      },
      {
        selector: 'edge[type="context-switch"]',
        style: {
          'line-color': '#8b5cf6',
          'target-arrow-color': '#8b5cf6',
          'line-style': 'dashed'
        }
      },
      {
        selector: 'edge[type="function-ref"]',
        style: {
          'line-color': '#64748b',
          'target-arrow-color': '#64748b',
          'line-style': 'dotted',
          'width': 1
        }
      }
    ],

    layout: {
      name: 'preset'
    },

    minZoom: 0.3,
    maxZoom: 2,
    wheelSensitivity: 0.2
  });

  // Handle node selection
  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    const data = node.data();
    selectNode(data.id, data.type);
  });

  // Handle canvas tap (deselect)
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      deselectNode();
    }
  });

  // Handle drop events
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    handleNodeDrop(nodeType, x, y);
  });

  return cy;
}

function handleNodeDrop(nodeType, x, y) {
  const state = getState();
  const position = cy.pan();
  const zoom = cy.zoom();

  // Convert screen coordinates to graph coordinates
  const graphX = (x - position.x) / zoom;
  const graphY = (y - position.y) / zoom;

  if (nodeType.startsWith('step-')) {
    const stepName = prompt('Enter step name:');
    if (!stepName) return;

    const stepId = addStep(state.ui.activeContextId, stepName);
    const context = state.contexts[state.ui.activeContextId];
    const step = context.steps[stepId];

    step.position = { x: graphX, y: graphY };

    addNodeToCanvas({
      id: stepId,
      type: 'step',
      label: stepName,
      contextId: state.ui.activeContextId,
      contextColor: getContextColor(state.ui.activeContextId),
      position: { x: graphX, y: graphY }
    });
  } else if (nodeType.startsWith('function-')) {
    const funcName = prompt('Enter function name:');
    if (!funcName) return;

    const funcId = addFunction(funcName);

    addNodeToCanvas({
      id: funcId,
      type: 'function',
      label: funcName,
      position: { x: graphX, y: graphY }
    });
  }
}

function addNodeToCanvas(data) {
  cy.add({
    group: 'nodes',
    data,
    position: data.position
  });
}

export function refreshCanvas() {
  if (!cy) return;

  const state = getState();
  cy.elements().remove();

  // Add all steps as nodes
  Object.values(state.contexts).forEach(context => {
    Object.values(context.steps).forEach(step => {
      cy.add({
        group: 'nodes',
        data: {
          id: step.id,
          type: 'step',
          label: step.name,
          contextId: context.id,
          contextColor: getContextColor(context.id)
        },
        position: step.position
      });
    });
  });

  // Add all functions as nodes
  Object.values(state.functions).forEach(func => {
    cy.add({
      group: 'nodes',
      data: {
        id: func.id,
        type: 'function',
        label: func.name
      },
      position: func.position || { x: 400, y: 300 }
    });
  });

  // Add edges for valid_steps
  Object.values(state.contexts).forEach(context => {
    Object.values(context.steps).forEach(step => {
      step.validSteps.forEach(targetId => {
        cy.add({
          group: 'edges',
          data: {
            id: `${step.id}-${targetId}`,
            source: step.id,
            target: targetId,
            type: 'valid-step'
          }
        });
      });

      // Add edges for context switches
      step.validContexts.forEach(contextId => {
        const targetContext = state.contexts[contextId];
        if (targetContext && Object.keys(targetContext.steps).length > 0) {
          const firstStep = Object.values(targetContext.steps)[0];
          cy.add({
            group: 'edges',
            data: {
              id: `${step.id}-ctx-${contextId}`,
              source: step.id,
              target: firstStep.id,
              type: 'context-switch'
            }
          });
        }
      });

      // Add edges for function references
      step.functions.forEach(funcId => {
        cy.add({
          group: 'edges',
          data: {
            id: `${step.id}-func-${funcId}`,
            source: step.id,
            target: funcId,
            type: 'function-ref'
          }
        });
      });
    });
  });

  // Fit to viewport if first load
  if (cy.nodes().length > 0) {
    cy.fit(cy.nodes(), 50);
  }
}

function getContextColor(contextId) {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];
  const contexts = Object.keys(getState().contexts);
  const index = contexts.indexOf(contextId);
  return colors[index % colors.length];
}

export function getCanvas() {
  return cy;
}
