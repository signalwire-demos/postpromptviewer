import { debounce, matchesSearch, highlightMatches, searchInObject, filterDataBySearch, escapeHtml } from '../../lib/search-filter.js';
import { getState, update, subscribe } from '../state.js';

export function renderGlobalData(container, payload) {
  let unsubscribe = null;
  let isRendering = false;
  let lastSearchQuery = '';
  let timelineInitialized = false;
  let playerInstance = null;

  // ---- Outer shell: sub-view toggle + two panes ----
  container.innerHTML = `
    <div class="gd-subview-toggle">
      <button class="gd-subview-btn gd-subview-btn--active" data-view="snapshot">Snapshot</button>
      <button class="gd-subview-btn" data-view="timeline">&#9654; Timeline</button>
    </div>
    <div id="gd-snapshot-pane"></div>
    <div id="gd-timeline-pane" style="display:none"></div>
  `;

  const snapshotPane = container.querySelector('#gd-snapshot-pane');
  const timelinePane = container.querySelector('#gd-timeline-pane');

  container.querySelectorAll('.gd-subview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.gd-subview-btn').forEach(b => b.classList.remove('gd-subview-btn--active'));
      btn.classList.add('gd-subview-btn--active');
      const view = btn.dataset.view;
      snapshotPane.style.display = view === 'snapshot' ? '' : 'none';
      timelinePane.style.display = view === 'timeline' ? '' : 'none';
      if (view === 'timeline' && !timelineInitialized) {
        timelineInitialized = true;
        playerInstance = renderTimelinePlayer(timelinePane, payload);
      }
      if (view === 'snapshot') playerInstance?.pause();
    });
  });

  // ---- Snapshot view (existing logic) ----

  function buildSections() {
    const sections = [];

    if (payload.globalData && Object.keys(payload.globalData).length > 0) {
      sections.push({
        title: 'Global Data',
        subtitle: 'Session state at end of call (mutated by SWAIG set_global_data actions)',
        data: payload.globalData,
      });
    }

    const userVars = payload.swmlVars?.userVariables;
    if (userVars && Object.keys(userVars).length > 0) {
      sections.push({
        title: 'User Variables',
        subtitle: 'Client-provided context from SDK connection',
        data: userVars,
      });
    }

    if (payload.swmlVars && Object.keys(payload.swmlVars).length > 0) {
      const { userVariables, ...rest } = payload.swmlVars;
      if (Object.keys(rest).length > 0) {
        sections.push({
          title: 'SWML Variables',
          subtitle: 'Runtime call variables (ai_result, recording, etc.)',
          data: rest,
        });
      }
    }

    if (payload.swmlCall && Object.keys(payload.swmlCall).length > 0) {
      sections.push({
        title: 'Call Metadata',
        subtitle: 'SWMLCall signaling-layer data',
        data: payload.swmlCall,
      });
    }

    if (payload.params && Object.keys(payload.params).length > 0) {
      sections.push({
        title: 'Parameters',
        subtitle: 'Application parameters passed to AI session',
        data: payload.params,
      });
    }

    if (payload.previousContexts && payload.previousContexts.length > 0) {
      sections.push({
        title: 'Previous Contexts',
        subtitle: 'Context from prior interactions',
        data: payload.previousContexts,
      });
    }

    if (payload.promptVars && Object.keys(payload.promptVars).length > 0) {
      sections.push({
        title: 'Prompt Variables',
        subtitle: 'Template variables active during session',
        data: payload.promptVars,
      });
    }

    return sections;
  }

  function applySearch(sections) {
    const { search } = getState();
    if (!search.query || search.activeTab !== 'globalData') return sections;
    return sections.filter(section => {
      if (matchesSearch(section.title, search.query, search.caseSensitive)) return true;
      if (matchesSearch(section.subtitle, search.query, search.caseSensitive)) return true;
      if (searchInObject(section.data, search.query, search.caseSensitive)) return true;
      return false;
    });
  }

  function renderSearchBar(totalSections, filteredCount) {
    const { search } = getState();
    const isSearching = search.query && search.activeTab === 'globalData';
    return `
      <div class="search-filter-bar">
        <div class="search-filter-bar__filters">
          ${isSearching ? `<span style="font-size:0.875rem;color:var(--text-secondary)">${filteredCount} of ${totalSections} sections</span>` : ''}
        </div>
        <div class="search-filter-bar__search">
          <div class="search-box">
            <input type="text" class="search-box__input" id="global-data-search-input"
              placeholder="Search global data..."
              value="${search.activeTab === 'globalData' ? search.query : ''}"
              aria-label="Search global data" />
            ${search.query && search.activeTab === 'globalData' ? `
              <button class="search-box__clear" id="clear-global-data-search" aria-label="Clear search">✕</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    if (isRendering) return;
    isRendering = true;

    const allSections = buildSections();

    if (allSections.length === 0) {
      snapshotPane.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No session data available</div>';
      isRendering = false;
      return;
    }

    const filteredSections = applySearch(allSections);
    const { search } = getState();
    lastSearchQuery = search.activeTab === 'globalData' ? search.query : '';
    const isSearching = search.query && search.activeTab === 'globalData';

    const focusedId = document.activeElement?.id;
    const selStart = document.activeElement?.selectionStart ?? null;
    const selEnd = document.activeElement?.selectionEnd ?? null;

    snapshotPane.innerHTML = `
      <div class="global-data-viewer">
        ${renderSearchBar(allSections.length, filteredSections.length)}
        ${filteredSections.length > 0 ? filteredSections.map((section) => {
          const originalIdx = allSections.indexOf(section);
          const displayTitle = isSearching
            ? highlightMatches(section.title, search.query, search.caseSensitive)
            : escapeHtml(section.title);
          const displaySubtitle = isSearching
            ? highlightMatches(section.subtitle, search.query, search.caseSensitive)
            : escapeHtml(section.subtitle);
          const autoExpand = isSearching ? 'open' : '';
          const filteredData = isSearching
            ? filterDataBySearch(section.data, search.query, search.caseSensitive)
            : section.data;
          return `
            <div class="global-data-section ${autoExpand}" data-section-id="${originalIdx}">
              <div class="global-data-header">
                <div>
                  <span class="global-data-arrow">&#x25B6;</span>
                  <span class="global-data-title">${displayTitle}</span>
                  <span class="global-data-subtitle">${displaySubtitle}</span>
                </div>
                <button class="global-data-copy" data-section-id="${originalIdx}" title="Copy entire section">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="global-data-body">
                ${renderDataItems(filteredData, originalIdx, '', search.query, search.caseSensitive, isSearching)}
              </div>
            </div>
          `;
        }).join('') : `
          <div class="filter-empty">
            <div class="filter-empty__icon">🔍</div>
            <div class="filter-empty__title">No sections match your search</div>
            <div class="filter-empty__message">Try a different search term</div>
          </div>
        `}
      </div>
    `;

    if (focusedId) {
      const restored = snapshotPane.querySelector(`#${focusedId}`);
      if (restored) {
        restored.focus();
        if (selStart !== null) {
          try { restored.setSelectionRange(selStart, selEnd ?? selStart); } catch {}
        }
      }
    }

    const searchInput = snapshotPane.querySelector('#global-data-search-input');
    if (searchInput) {
      const debouncedSearch = debounce((value) => {
        update({ search: { ...getState().search, query: value, activeTab: value ? 'globalData' : null, currentMatch: 0 } });
      }, 300);
      searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    }

    const clearBtn = snapshotPane.querySelector('#clear-global-data-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        update({ search: { query: '', caseSensitive: false, currentMatch: 0, totalMatches: 0, activeTab: null } });
      });
    }

    snapshotPane.querySelectorAll('.global-data-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.global-data-copy')) return;
        header.closest('.global-data-section').classList.toggle('open');
      });
    });

    snapshotPane.querySelectorAll('.global-data-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sectionId = parseInt(btn.dataset.sectionId);
        const section = allSections[sectionId];
        navigator.clipboard.writeText(JSON.stringify(section.data, null, 2)).then(() => {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          }, 2000);
        });
      });
    });

    snapshotPane.querySelectorAll('.global-data-item-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.value).then(() => {
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          }, 2000);
        });
      });
    });

    snapshotPane.querySelectorAll('.global-data-nested-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.closest('.global-data-item').classList.toggle('expanded');
      });
    });

    if (!unsubscribe) {
      unsubscribe = subscribe((state) => {
        const currentQuery = state.search.activeTab === 'globalData' ? state.search.query : '';
        if (currentQuery !== lastSearchQuery) render();
      });
    }

    isRendering = false;
  }

  render();
}

// ============================================================
// Timeline Player
// ============================================================

function extractGlobalDataEvents(payload) {
  const swaigLog = payload.swaigLog || [];
  const callStartUs = payload.callStartDate;
  const callEndUs = payload.callEndDate || payload.aiEndDate;
  const totalDuration = callEndUs ? Math.max((callEndUs - callStartUs) / 1e6, 1) : 60;

  const sorted = [...swaigLog].sort((a, b) =>
    (a.epoch_time || a.epochTime || 0) - (b.epoch_time || b.epochTime || 0));

  // Get initial state from first swaig_log entry's post_data
  const firstEntry = sorted[0];
  const initialState = firstEntry?.post_data?.global_data ||
    firstEntry?.postData?.globalData || {};

  const events = [];
  let currentSnapshot = JSON.parse(JSON.stringify(initialState));

  sorted.forEach(entry => {
    const epochUs = (entry.epoch_time || entry.epochTime || 0) * 1_000_000;
    const funcName = entry.command_name || entry.commandName || 'unknown';
    const actions = entry.post_response?.action || entry.postResponse?.action || [];

    actions.forEach(action => {
      if (!action.set_global_data) return;
      const patch = action.set_global_data;

      const prevSnapshot = JSON.parse(JSON.stringify(currentSnapshot));
      const added = [], updated = [], removed = [];

      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          if (key in currentSnapshot) { removed.push(key); delete currentSnapshot[key]; }
        } else if (!(key in currentSnapshot)) {
          added.push(key);
          currentSnapshot[key] = value;
        } else {
          if (JSON.stringify(currentSnapshot[key]) !== JSON.stringify(value)) updated.push(key);
          currentSnapshot[key] = value;
        }
      });

      if (added.length || updated.length || removed.length) {
        const relativeTime = callStartUs ? (epochUs - callStartUs) / 1e6 : 0;
        events.push({
          timestamp: epochUs,
          relativeTime: Math.max(0, relativeTime),
          functionName: funcName,
          snapshot: JSON.parse(JSON.stringify(currentSnapshot)),
          prevSnapshot,
          delta: { added, updated, removed },
        });
      }
    });
  });

  return { events, initialState, totalDuration, callStartUs };
}

function buildExpandedTreeDOM(data, path = '', depth = 0) {
  const wrapper = document.createElement('div');
  wrapper.className = `gd-tree-items${depth > 0 ? ' gd-tree-items--nested' : ''}`;

  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v, `[${i}]`])
    : Object.entries(data).map(([k, v]) => [k, v, k]);

  entries.forEach(([key, value, displayKey]) => {
    wrapper.appendChild(buildSingleTreeRow(displayKey, value, path ? `${path}.${key}` : key, depth));
  });

  return wrapper;
}

function buildSingleTreeRow(displayKey, value, fullPath, depth = 0) {
  const isObj = typeof value === 'object' && value !== null;
  const isArr = Array.isArray(value);

  const row = document.createElement('div');
  row.className = `gd-tree-row${isObj ? ' gd-tree-row--object' : ''}`;
  row.dataset.path = fullPath;

  const head = document.createElement('div');
  head.className = 'gd-tree-row-head';

  const keySpan = document.createElement('span');
  keySpan.className = 'gd-tree-key';
  keySpan.textContent = displayKey;
  head.appendChild(keySpan);

  if (isObj) {
    const bracketSpan = document.createElement('span');
    bracketSpan.className = 'gd-tree-bracket';
    bracketSpan.textContent = isArr ? `[${value.length}]` : '{ }';
    head.appendChild(bracketSpan);
    row.appendChild(head);

    const children = document.createElement('div');
    children.className = 'gd-tree-children';
    children.appendChild(buildExpandedTreeDOM(value, fullPath, depth + 1));
    row.appendChild(children);
  } else {
    const valSpan = document.createElement('span');
    valSpan.className = 'gd-tree-val';
    valSpan.textContent = formatValue(value);
    head.appendChild(valSpan);
    row.appendChild(head);
  }

  return row;
}

function applyEventToTree(treeContainer, event) {
  // Strip previous highlights
  treeContainer.querySelectorAll('.gd--added, .gd--updated').forEach(el => {
    el.classList.remove('gd--added', 'gd--updated');
  });
  // Remove lingering ghost rows
  treeContainer.querySelectorAll('.gd--removed').forEach(el => el.remove());

  // Rebuild tree from new snapshot
  treeContainer.innerHTML = '';
  treeContainer.appendChild(buildExpandedTreeDOM(event.snapshot));

  // Highlight added rows
  event.delta.added.forEach(key => {
    const row = treeContainer.querySelector(`[data-path="${CSS.escape(key)}"]`);
    if (row) row.classList.add('gd--added');
  });

  // Highlight updated rows
  event.delta.updated.forEach(key => {
    const row = treeContainer.querySelector(`[data-path="${CSS.escape(key)}"]`);
    if (row) row.classList.add('gd--updated');
  });

  // Inject ghost rows for removed keys (fade out over 3s)
  if (event.delta.removed.length > 0) {
    const treeItems = treeContainer.querySelector('.gd-tree-items');
    event.delta.removed.forEach(key => {
      const oldVal = event.prevSnapshot[key];
      if (oldVal === undefined) return;
      const ghostRow = buildSingleTreeRow(key, oldVal, key);
      ghostRow.classList.add('gd--removed');
      treeItems?.appendChild(ghostRow);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ghostRow.style.opacity = '0';
        });
      });
      setTimeout(() => ghostRow?.remove(), 3100);
    });
  }
}

function showInitialTree(treeContainer, initialState) {
  treeContainer.querySelectorAll('.gd--added, .gd--updated, .gd--removed').forEach(el => {
    el.classList.remove('gd--added', 'gd--updated', 'gd--removed');
  });
  treeContainer.innerHTML = '';
  if (Object.keys(initialState).length === 0) {
    treeContainer.innerHTML = '<div class="gd-tree-empty">No global_data at call start</div>';
  } else {
    treeContainer.appendChild(buildExpandedTreeDOM(initialState));
  }
}

function createPlayer(totalDuration, onTick, onDone) {
  let playing = false;
  let speed = 1;
  let virtualTime = 0;
  let lastReal = null;
  let rafId = null;
  let alive = true;

  function tick(real) {
    if (!playing || !alive) return;
    if (lastReal !== null) {
      const elapsed = (real - lastReal) / 1000;
      virtualTime = Math.min(virtualTime + elapsed * speed, totalDuration);
    }
    lastReal = real;
    onTick(virtualTime);
    if (virtualTime >= totalDuration) {
      playing = false;
      onDone?.();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    play() {
      if (playing || virtualTime >= totalDuration) return;
      playing = true;
      lastReal = null;
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      lastReal = null;
    },
    seek(t) {
      virtualTime = Math.max(0, Math.min(t, totalDuration));
      onTick(virtualTime);
    },
    setSpeed(s) { speed = s; },
    reset() {
      playing = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      virtualTime = 0;
      lastReal = null;
      onTick(0);
    },
    get time() { return virtualTime; },
    get isPlaying() { return playing; },
    destroy() {
      alive = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

function formatTimeSec(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${ms}`;
}

function renderTimelinePlayer(container, payload) {
  const { events, initialState, totalDuration } = extractGlobalDataEvents(payload);

  if (events.length === 0) {
    container.innerHTML = `
      <div class="gd-tree-empty" style="margin:3rem auto;max-width:400px;text-align:center">
        <div style="font-size:2rem;margin-bottom:1rem">📭</div>
        <div style="font-weight:600;color:var(--text-secondary);margin-bottom:0.5rem">No global_data mutations found</div>
        <div style="color:var(--text-muted);font-size:0.8rem">No <code>set_global_data</code> actions were found in the SWAIG log for this call.</div>
      </div>
    `;
    return null;
  }

  // Build player HTML shell
  container.innerHTML = `
    <div class="gd-player">
      <div class="gd-player-controls">
        <button class="gd-btn" id="gd-reset" title="Reset to start">&#x23EE;</button>
        <button class="gd-btn" id="gd-prev" title="Previous event">&#x25C0;</button>
        <button class="gd-btn gd-btn--primary" id="gd-play" title="Play / Pause">&#9654;</button>
        <button class="gd-btn" id="gd-next" title="Next event">&#x25B6;</button>
        <div class="gd-speed-buttons">
          <button class="gd-speed-btn" data-speed="1">1×</button>
          <button class="gd-speed-btn" data-speed="2">2×</button>
          <button class="gd-speed-btn" data-speed="3">3×</button>
        </div>
        <span class="gd-event-count">${events.length} mutation${events.length !== 1 ? 's' : ''}</span>
        <span class="gd-time-display" id="gd-time-display">0:00.0 / ${formatTimeSec(totalDuration)}</span>
      </div>
      <div class="gd-progress-wrap">
        <div class="gd-progress-bg" id="gd-progress-bg">
          <div class="gd-progress-fill" id="gd-progress-fill" style="width:0%"></div>
          ${events.map((ev, i) => {
            const pct = Math.min((ev.relativeTime / totalDuration) * 100, 100);
            return `<div class="gd-event-marker" data-idx="${i}" style="left:${pct}%" title="${ev.functionName} @ ${formatTimeSec(ev.relativeTime)}"></div>`;
          }).join('')}
        </div>
      </div>
    </div>
    <div class="gd-layout">
      <div class="gd-tree-pane" id="gd-tree-container"></div>
      <div class="gd-event-pane">
        <div class="gd-event-pane-header">Mutations</div>
        ${events.map((ev, i) => `
          <div class="gd-event-item" data-idx="${i}">
            <span class="gd-event-diamond">&#x25C6;</span>
            <div>
              <div class="gd-event-func">${escapeHtml(ev.functionName)}</div>
              <div class="gd-event-time">${formatTimeSec(ev.relativeTime)}</div>
              <div class="gd-event-badges">
                ${ev.delta.added.map(k => `<span class="gd-badge gd-badge--added">+${escapeHtml(k)}</span>`).join('')}
                ${ev.delta.updated.map(k => `<span class="gd-badge gd-badge--updated">~${escapeHtml(k)}</span>`).join('')}
                ${ev.delta.removed.map(k => `<span class="gd-badge gd-badge--removed">-${escapeHtml(k)}</span>`).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const treeContainer = container.querySelector('#gd-tree-container');
  const progressFill = container.querySelector('#gd-progress-fill');
  const progressBg = container.querySelector('#gd-progress-bg');
  const timeDisplay = container.querySelector('#gd-time-display');
  const playBtn = container.querySelector('#gd-play');

  // Show initial state
  showInitialTree(treeContainer, initialState);

  // Track which event index has been applied
  let currentEventIdx = -1;

  function applyUpTo(virtualTime) {
    // Find the last event at or before virtualTime
    let targetIdx = -1;
    for (let i = 0; i < events.length; i++) {
      if (events[i].relativeTime <= virtualTime) targetIdx = i;
      else break;
    }

    if (targetIdx !== currentEventIdx) {
      if (targetIdx === -1) {
        showInitialTree(treeContainer, initialState);
      } else {
        applyEventToTree(treeContainer, events[targetIdx]);
      }
      currentEventIdx = targetIdx;
      updateEventList(targetIdx);
    }

    // Update progress
    const pct = Math.min((virtualTime / totalDuration) * 100, 100);
    progressFill.style.width = `${pct}%`;
    timeDisplay.textContent = `${formatTimeSec(virtualTime)} / ${formatTimeSec(totalDuration)}`;

    // Update event markers
    container.querySelectorAll('.gd-event-marker').forEach((marker, i) => {
      marker.classList.toggle('gd-event-marker--active', i === currentEventIdx);
    });
  }

  function updateEventList(activeIdx) {
    container.querySelectorAll('.gd-event-item').forEach((item, i) => {
      item.classList.toggle('gd-event-item--active', i === activeIdx);
      if (i === activeIdx) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  const player = createPlayer(totalDuration, applyUpTo, () => {
    playBtn.innerHTML = '&#9654;';
  });

  // Play / pause
  playBtn.addEventListener('click', () => {
    if (player.isPlaying) {
      player.pause();
      playBtn.innerHTML = '&#9654;';
    } else {
      if (player.time >= totalDuration) player.reset();
      player.play();
      playBtn.innerHTML = '&#9646;&#9646;';
    }
  });

  // Reset
  container.querySelector('#gd-reset').addEventListener('click', () => {
    player.pause();
    playBtn.innerHTML = '&#9654;';
    player.reset();
    currentEventIdx = -1;
    showInitialTree(treeContainer, initialState);
    progressFill.style.width = '0%';
    timeDisplay.textContent = `0:00.0 / ${formatTimeSec(totalDuration)}`;
    container.querySelectorAll('.gd-event-marker').forEach(m => m.classList.remove('gd-event-marker--active'));
    updateEventList(-1);
  });

  // Prev event
  container.querySelector('#gd-prev').addEventListener('click', () => {
    const target = currentEventIdx <= 0 ? 0 : events[currentEventIdx - 1].relativeTime;
    player.seek(Math.max(0, target - 0.001));
    if (player.isPlaying) { player.pause(); playBtn.innerHTML = '&#9654;'; }
  });

  // Next event
  container.querySelector('#gd-next').addEventListener('click', () => {
    const nextIdx = currentEventIdx + 1;
    if (nextIdx < events.length) {
      player.seek(events[nextIdx].relativeTime);
      if (player.isPlaying) { player.pause(); playBtn.innerHTML = '&#9654;'; }
    }
  });

  // Speed buttons — restore saved speed, then persist on click
  const savedSpeed = parseFloat(localStorage.getItem('gd_timeline_speed') || '1');
  player.setSpeed(savedSpeed);
  container.querySelectorAll('.gd-speed-btn').forEach(btn => {
    if (parseFloat(btn.dataset.speed) === savedSpeed) btn.classList.add('gd-speed-btn--active');
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      container.querySelectorAll('.gd-speed-btn').forEach(b => b.classList.remove('gd-speed-btn--active'));
      btn.classList.add('gd-speed-btn--active');
      player.setSpeed(speed);
      localStorage.setItem('gd_timeline_speed', speed);
    });
  });

  // Click on progress bar to seek
  progressBg.addEventListener('click', (e) => {
    const rect = progressBg.getBoundingClientRect();
    const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    player.seek(pct * totalDuration);
    if (player.isPlaying) { player.pause(); playBtn.innerHTML = '&#9654;'; }
  });

  // Click on event markers
  container.querySelectorAll('.gd-event-marker').forEach(marker => {
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(marker.dataset.idx);
      player.seek(events[idx].relativeTime);
      if (player.isPlaying) { player.pause(); playBtn.innerHTML = '&#9654;'; }
    });
  });

  // Click on event list items
  container.querySelectorAll('.gd-event-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      player.seek(events[idx].relativeTime);
      if (player.isPlaying) { player.pause(); playBtn.innerHTML = '&#9654;'; }
    });
  });

  return player;
}

// ============================================================
// Snapshot view helpers (unchanged)
// ============================================================

function renderDataItems(data, sectionIdx, parentKey = '', query = '', caseSensitive = false, isSearching = false) {
  if (Array.isArray(data)) {
    return `
      <div class="global-data-items">
        ${data.map((item, idx) => {
          const itemKey = `${parentKey}[${idx}]`;
          return renderDataItem(itemKey, item, sectionIdx, itemKey, query, caseSensitive, isSearching);
        }).join('')}
      </div>
    `;
  }

  if (typeof data === 'object' && data !== null) {
    return `
      <div class="global-data-items">
        ${Object.entries(data).map(([key, value]) => {
          const itemKey = parentKey ? `${parentKey}.${key}` : key;
          return renderDataItem(key, value, sectionIdx, itemKey, query, caseSensitive, isSearching);
        }).join('')}
      </div>
    `;
  }

  return `<div class="global-data-items"><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre></div>`;
}

function renderDataItem(key, value, sectionIdx, fullKey, query = '', caseSensitive = false, isSearching = false) {
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);
  const displayValue = isObject ? (isArray ? `Array[${value.length}]` : 'Object') : formatValue(value);
  const valueString = JSON.stringify(value, null, 2);
  const containsMatch = isSearching && isObject && searchInObject(value, query, caseSensitive);

  return `
    <div class="global-data-item ${isObject ? 'has-nested' : ''} ${containsMatch ? 'expanded' : ''}" data-key="${escapeHtml(fullKey || key)}">
      <div class="global-data-item-row">
        ${isObject ? '<span class="global-data-nested-toggle">&#x25B6;</span>' : '<span class="global-data-item-spacer"></span>'}
        <span class="global-data-item-key">${escapeHtml(key)}</span>
        <span class="global-data-item-value ${isObject ? 'is-object' : ''}">${escapeHtml(displayValue)}</span>
        <button class="global-data-item-copy" data-value="${escapeHtml(valueString)}" title="Copy value">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      ${isObject ? `
        <div class="global-data-item-nested">
          ${renderDataItems(value, sectionIdx, fullKey || key, query, caseSensitive, isSearching)}
        </div>
      ` : ''}
    </div>
  `;
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  return String(value);
}
