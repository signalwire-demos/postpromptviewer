const state = {
  payload: null,
  metrics: null,
  activeTab: 'dashboard',
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
