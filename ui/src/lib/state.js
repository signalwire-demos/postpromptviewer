/**
 * Global state management for Agent Builder
 * Pub/sub pattern matching the postpromptviewer architecture
 */

let state = {
  // Agent metadata
  agent: {
    name: 'Untitled Agent',
    route: '/agent',
    version: '1.0.0'
  },

  // Base prompt (applies to all contexts)
  basePrompt: [],

  // Contexts collection
  contexts: {
    'default': {
      id: 'default',
      name: 'default',
      isolated: false,
      prompt: [],
      enterFillers: {},
      steps: {}
    }
  },

  // Functions/Tools collection
  functions: {},

  // Languages
  languages: [],

  // SWML methods (Answer, Play, Record, etc.)
  swmlMethods: [],

  // Post prompt configuration
  postPrompt: {
    text: '',
    url: ''
  },

  // AI configuration
  aiConfig: {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: null
  },

  // UI state
  ui: {
    selectedNodeId: null,
    selectedNodeType: null, // 'step', 'function', 'context'
    activeContextId: 'default',
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 }
  }
};

const subscribers = new Set();

export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getState() {
  return state;
}

export function update(partial) {
  state = { ...state, ...partial };
  subscribers.forEach(callback => callback(state));
}

export function updateNested(path, value) {
  const keys = path.split('.');
  const newState = JSON.parse(JSON.stringify(state));

  let current = newState;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;

  state = newState;
  subscribers.forEach(callback => callback(state));
}

// Helper functions for common operations

export function addContext(name) {
  const id = `context_${Date.now()}`;
  const newContexts = { ...state.contexts };
  newContexts[id] = {
    id,
    name,
    isolated: false,
    prompt: [],
    enterFillers: {},
    steps: {}
  };
  update({ contexts: newContexts });
  return id;
}

export function addStep(contextId, stepName) {
  const stepId = `step_${Date.now()}`;
  const newContexts = { ...state.contexts };
  newContexts[contextId].steps[stepId] = {
    id: stepId,
    name: stepName,
    contextId,
    instructions: [],
    criteria: '',
    functions: [],
    validSteps: [],
    validContexts: [],
    gatherInfo: null,
    position: { x: 100, y: 100 }
  };
  update({ contexts: newContexts });
  return stepId;
}

export function addFunction(name) {
  const funcId = `func_${Date.now()}`;
  const newFunctions = { ...state.functions };
  newFunctions[funcId] = {
    id: funcId,
    name,
    purpose: '',
    parameters: [],
    metaArgs: {},
    webHookUrl: '',
    swaigFields: {}
  };
  update({ functions: newFunctions });
  return funcId;
}

export function deleteStep(stepId) {
  const newContexts = { ...state.contexts };

  // Find and delete the step
  for (const contextId in newContexts) {
    if (newContexts[contextId].steps[stepId]) {
      delete newContexts[contextId].steps[stepId];
      break;
    }
  }

  // Remove references from other steps
  for (const contextId in newContexts) {
    for (const sId in newContexts[contextId].steps) {
      const step = newContexts[contextId].steps[sId];
      step.validSteps = step.validSteps.filter(id => id !== stepId);
    }
  }

  update({ contexts: newContexts });
}

export function deleteFunction(funcId) {
  const newFunctions = { ...state.functions };
  delete newFunctions[funcId];

  // Remove references from steps
  const newContexts = { ...state.contexts };
  for (const contextId in newContexts) {
    for (const stepId in newContexts[contextId].steps) {
      const step = newContexts[contextId].steps[stepId];
      step.functions = step.functions.filter(id => id !== funcId);
    }
  }

  update({ functions: newFunctions, contexts: newContexts });
}

export function selectNode(nodeId, nodeType) {
  update({
    ui: {
      ...state.ui,
      selectedNodeId: nodeId,
      selectedNodeType: nodeType
    }
  });
}

export function deselectNode() {
  update({
    ui: {
      ...state.ui,
      selectedNodeId: null,
      selectedNodeType: null
    }
  });
}
