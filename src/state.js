const state = {
  payload: null,
  metrics: null,
  swml: null,
  activeTab: 'dashboard',
  viewMode: null, // 'postprompt' or 'swml'
  showRedacted: false,
  // P.I.E. browse mode
  browseMode: false,
  recordSource: null, // 'file' | 'database'
  currentRecordCallId: null,
  search: {
    query: '',
    caseSensitive: false,
    currentMatch: 0,
    totalMatches: 0,
    activeTab: null
  },
  filters: {
    transcript: {
      roles: [],
      hasBarge: false,
      hasMerge: false,
      hasToolCalls: false,
      hasGarbage: false,
      hasInterrupted: false,
      responseTimeRating: '' // '', 'excellent', 'good', 'fair', 'needs-improvement'
    }
  }
};

const listeners = new Set();

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const update = (patch) => {
  Object.assign(state, patch);
  listeners.forEach(fn => fn(state));
};

export const getState = () => state;
