import { update } from './state.js';
import { refreshCanvas } from '../components/canvas.js';

export function importSWML() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const swml = JSON.parse(event.target.result);
        const state = parseSWMLToState(swml);
        update(state);
        refreshCanvas();
        alert('SWML imported successfully!');
      } catch (err) {
        alert(`Failed to import SWML: ${err.message}`);
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  input.click();
}

function parseSWMLToState(swml) {
  const state = {
    agent: {
      name: 'Imported Agent',
      route: '/agent',
      version: swml.version || '1.0.0'
    },
    basePrompt: [],
    contexts: {},
    functions: {},
    languages: [],
    swmlMethods: [],
    postPrompt: {},
    aiConfig: {},
    ui: {
      selectedNodeId: null,
      selectedNodeType: null,
      activeContextId: null,
      canvasZoom: 1,
      canvasPan: { x: 0, y: 0 }
    }
  };

  // Find AI block
  let aiBlock = null;
  for (const method of swml.sections.main || []) {
    if (method.ai) {
      aiBlock = method.ai;
      break;
    }
  }

  if (!aiBlock) {
    throw new Error('No AI configuration found in SWML');
  }

  // Parse base prompt
  if (aiBlock.prompt && aiBlock.prompt.pom) {
    state.basePrompt = aiBlock.prompt.pom;
  }

  // Parse contexts
  if (aiBlock.prompt && aiBlock.prompt.contexts) {
    Object.entries(aiBlock.prompt.contexts).forEach(([contextName, contextData], idx) => {
      const contextId = `context_${idx}`;

      state.contexts[contextId] = {
        id: contextId,
        name: contextName,
        isolated: contextData.isolated || false,
        prompt: contextData.prompt?.pom || [],
        enterFillers: {},
        steps: {}
      };

      if (!state.ui.activeContextId) {
        state.ui.activeContextId = contextId;
      }

      // Parse steps
      if (contextData.steps) {
        contextData.steps.forEach((stepData, stepIdx) => {
          const stepId = `step_${idx}_${stepIdx}`;

          state.contexts[contextId].steps[stepId] = {
            id: stepId,
            name: stepData.name,
            contextId,
            instructions: parseStepText(stepData.text),
            criteria: stepData.step_criteria || '',
            functions: Array.isArray(stepData.functions) ? stepData.functions : [],
            validSteps: stepData.valid_steps || [],
            validContexts: stepData.valid_contexts || [],
            gatherInfo: stepData.gather_info || null,
            position: { x: 100 + (stepIdx * 200), y: 100 + (idx * 150) }
          };
        });
      }
    });
  }

  // Parse functions
  if (aiBlock.functions) {
    aiBlock.functions.forEach((funcData, idx) => {
      const funcId = `func_${idx}`;

      const parameters = [];
      if (funcData.argument) {
        Object.entries(funcData.argument).forEach(([paramName, paramData]) => {
          parameters.push({
            name: paramName,
            type: paramData.type || 'string',
            description: paramData.description || '',
            required: funcData.argument_required?.includes(paramName) || false
          });
        });
      }

      state.functions[funcId] = {
        id: funcId,
        name: funcData.function,
        purpose: funcData.purpose || '',
        parameters,
        metaArgs: funcData.meta_args || {},
        webHookUrl: funcData.web_hook_url || '',
        swaigFields: {}
      };
    });
  }

  // Parse AI config
  if (aiBlock.temperature !== undefined) {
    state.aiConfig.temperature = aiBlock.temperature;
  }
  if (aiBlock.top_p !== undefined) {
    state.aiConfig.top_p = aiBlock.top_p;
  }

  return state;
}

function parseStepText(text) {
  if (!text) return [];

  // Try to parse structured text with ## headers
  const sections = [];
  const lines = text.split('\n');

  let currentSection = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: line.substring(3).trim(),
        body: ''
      };
    } else if (currentSection) {
      currentSection.body += line + '\n';
    }
  }

  if (currentSection) {
    currentSection.body = currentSection.body.trim();
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections : [{ title: 'Instructions', body: text }];
}
