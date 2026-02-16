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
  // First pass: create contexts and steps, build name-to-ID mapping
  const stepNameToId = new Map();
  const contextNameToId = new Map();

  if (aiBlock.prompt && aiBlock.prompt.contexts) {
    Object.entries(aiBlock.prompt.contexts).forEach(([contextName, contextData], idx) => {
      const contextId = `context_${idx}`;
      contextNameToId.set(contextName, contextId);

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
          stepNameToId.set(stepData.name, stepId);

          state.contexts[contextId].steps[stepId] = {
            id: stepId,
            name: stepData.name,
            contextId,
            instructions: parseStepText(stepData.text),
            criteria: stepData.step_criteria || '',
            functions: Array.isArray(stepData.functions) ? stepData.functions : [],
            validSteps: stepData.valid_steps || [], // Will be converted in second pass
            validContexts: stepData.valid_contexts || [], // Will be converted in second pass
            gatherInfo: stepData.gather_info || null,
            position: { x: 100 + (stepIdx * 200), y: 100 + (idx * 150) }
          };
        });
      }
    });

    // Second pass: convert step names to IDs in validSteps and validContexts
    Object.values(state.contexts).forEach(context => {
      Object.values(context.steps).forEach(step => {
        // Convert valid_steps from names to IDs
        if (step.validSteps && step.validSteps.length > 0) {
          step.validSteps = step.validSteps
            .map(stepName => stepNameToId.get(stepName))
            .filter(Boolean); // Remove any that weren't found
        }

        // Convert valid_contexts from names to IDs
        if (step.validContexts && step.validContexts.length > 0) {
          step.validContexts = step.validContexts
            .map(contextName => contextNameToId.get(contextName))
            .filter(Boolean); // Remove any that weren't found
        }
      });
    });
  }

  // Parse functions and build name-to-ID mapping
  const functionNameToId = new Map();

  // Check both aiBlock.functions (old format) and aiBlock.SWAIG.functions (new format)
  const functionsArray = aiBlock.SWAIG?.functions || aiBlock.functions || [];

  if (functionsArray.length > 0) {
    functionsArray.forEach((funcData, idx) => {
      const funcId = `func_${idx}`;
      functionNameToId.set(funcData.function, funcId);

      const parameters = [];

      // Handle new SWAIG format with JSON Schema parameters
      if (funcData.parameters?.properties) {
        const required = funcData.parameters.required || [];
        Object.entries(funcData.parameters.properties).forEach(([paramName, paramData]) => {
          parameters.push({
            name: paramName,
            type: paramData.type || 'string',
            description: paramData.description || '',
            required: required.includes(paramName)
          });
        });
      }
      // Handle old format with argument
      else if (funcData.argument) {
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
        purpose: funcData.purpose || funcData.description || '',
        parameters,
        metaArgs: funcData.meta_args || funcData.meta_data || {},
        webHookUrl: funcData.web_hook_url || '',
        swaigFields: {
          wait_file: funcData.wait_file,
          wait_file_loops: funcData.wait_file_loops
        },
        position: { x: 600, y: 100 + (idx * 120) }
      };
    });

    // Convert function names to IDs in steps
    Object.values(state.contexts).forEach(context => {
      Object.values(context.steps).forEach(step => {
        if (step.functions && Array.isArray(step.functions) && step.functions.length > 0) {
          // Skip if it's the special "none" value
          if (step.functions[0] === 'none') return;

          step.functions = step.functions
            .map(funcName => functionNameToId.get(funcName) || funcName)
            .filter(Boolean);
        }
      });
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
