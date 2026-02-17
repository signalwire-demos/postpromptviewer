import { debounce, matchesSearch, highlightMatches, searchInObject, filterDataBySearch, escapeHtml } from '../../lib/search-filter.js';
import { getState, update, subscribe } from '../state.js';

export function renderGlobalData(container, payload) {
  let unsubscribe = null;
  let isRendering = false;
  let lastSearchQuery = '';

  function buildSections() {
    const sections = [];

    // 1. Global Data section
    if (payload.globalData && Object.keys(payload.globalData).length > 0) {
      sections.push({
        title: 'Global Data',
        subtitle: 'Session state at end of call (mutated by SWAIG set_global_data actions)',
        data: payload.globalData,
      });
    }

    // 2. User Variables section (from SWMLVars.userVariables)
    const userVars = payload.swmlVars?.userVariables;
    if (userVars && Object.keys(userVars).length > 0) {
      sections.push({
        title: 'User Variables',
        subtitle: 'Client-provided context from SDK connection',
        data: userVars,
      });
    }

    // 3. SWMLVars section (without userVariables, show remaining fields)
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

    // 4. SWMLCall metadata
    if (payload.swmlCall && Object.keys(payload.swmlCall).length > 0) {
      sections.push({
        title: 'Call Metadata',
        subtitle: 'SWMLCall signaling-layer data',
        data: payload.swmlCall,
      });
    }

    // 5. Params (if present)
    if (payload.params && Object.keys(payload.params).length > 0) {
      sections.push({
        title: 'Parameters',
        subtitle: 'Application parameters passed to AI session',
        data: payload.params,
      });
    }

    // 6. Previous Contexts (if present)
    if (payload.previousContexts && payload.previousContexts.length > 0) {
      sections.push({
        title: 'Previous Contexts',
        subtitle: 'Context from prior interactions',
        data: payload.previousContexts,
      });
    }

    // 7. Prompt Vars (if present)
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

    if (!search.query || search.activeTab !== 'globalData') {
      return sections;
    }

    return sections.filter(section => {
      // Search in section title
      if (matchesSearch(section.title, search.query, search.caseSensitive)) {
        return true;
      }

      // Search in section subtitle
      if (matchesSearch(section.subtitle, search.query, search.caseSensitive)) {
        return true;
      }

      // Search in section data (deep search)
      if (searchInObject(section.data, search.query, search.caseSensitive)) {
        return true;
      }

      return false;
    });
  }

  function renderSearchBar(totalSections, filteredCount) {
    const { search } = getState();
    const isSearching = search.query && search.activeTab === 'globalData';

    return `
      <div class="search-filter-bar">
        <div class="search-filter-bar__filters">
          ${isSearching ? `
            <span style="font-size: 0.875rem; color: var(--text-secondary);">
              ${filteredCount} of ${totalSections} sections
            </span>
          ` : ''}
        </div>
        <div class="search-filter-bar__search">
          <div class="search-box">
            <input
              type="text"
              class="search-box__input"
              id="global-data-search-input"
              placeholder="Search global data..."
              value="${search.activeTab === 'globalData' ? search.query : ''}"
              aria-label="Search global data"
            />
            ${search.query && search.activeTab === 'globalData' ? `
              <button class="search-box__clear" id="clear-global-data-search" aria-label="Clear search">
                ✕
              </button>
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
      container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No session data available</div>';
      isRendering = false;
      return;
    }

    const filteredSections = applySearch(allSections);
    const { search } = getState();
    lastSearchQuery = search.activeTab === 'globalData' ? search.query : '';
    const isSearching = search.query && search.activeTab === 'globalData';

    // Save focus state before innerHTML wipes the DOM
    const focusedId = document.activeElement?.id;
    const selStart = document.activeElement?.selectionStart ?? null;
    const selEnd = document.activeElement?.selectionEnd ?? null;

    container.innerHTML = `
      <div class="global-data-viewer">
        ${renderSearchBar(allSections.length, filteredSections.length)}
        ${filteredSections.length > 0 ? filteredSections.map((section, sectionIdx) => {
          // Find original section index for proper data mapping
          const originalIdx = allSections.indexOf(section);

          // Highlight section title if searching
          const displayTitle = isSearching
            ? highlightMatches(section.title, search.query, search.caseSensitive)
            : escapeHtml(section.title);

          const displaySubtitle = isSearching
            ? highlightMatches(section.subtitle, search.query, search.caseSensitive)
            : escapeHtml(section.subtitle);

          // Auto-expand sections that match search
          const autoExpand = isSearching ? 'open' : '';

          // Filter data when searching to show only matching fields
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

    // Restore focus and cursor after innerHTML replacement
    if (focusedId) {
      const restored = container.querySelector(`#${focusedId}`);
      if (restored) {
        restored.focus();
        if (selStart !== null) {
          try { restored.setSelectionRange(selStart, selEnd ?? selStart); } catch {}
        }
      }
    }

    // Search input handler (debounced)
    const searchInput = container.querySelector('#global-data-search-input');
    if (searchInput) {
      const debouncedSearch = debounce((value) => {
        update({
          search: {
            ...getState().search,
            query: value,
            activeTab: value ? 'globalData' : null,
            currentMatch: 0
          }
        });
      }, 300);

      searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    }

    // Clear search button
    const clearBtn = container.querySelector('#clear-global-data-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        update({
          search: {
            query: '',
            caseSensitive: false,
            currentMatch: 0,
            totalMatches: 0,
            activeTab: null
          }
        });
      });
    }

    // Add accordion toggle
    container.querySelectorAll('.global-data-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.global-data-copy')) return;
        const section = header.closest('.global-data-section');
        section.classList.toggle('open');
      });
    });

    // Add copy section button handlers
    container.querySelectorAll('.global-data-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sectionId = parseInt(btn.dataset.sectionId);
        const section = allSections[sectionId];
        const jsonString = JSON.stringify(section.data, null, 2);

        navigator.clipboard.writeText(jsonString).then(() => {
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
          setTimeout(() => {
            btn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            `;
          }, 2000);
        });
      });
    });

    // Add copy item button handlers
    container.querySelectorAll('.global-data-item-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        navigator.clipboard.writeText(value).then(() => {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
          setTimeout(() => {
            btn.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            `;
          }, 2000);
        });
      });
    });

    // Add expand/collapse nested objects
    container.querySelectorAll('.global-data-nested-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const item = toggle.closest('.global-data-item');
        item.classList.toggle('expanded');
      });
    });

    // Subscribe to state changes (only set up once)
    if (!unsubscribe) {
      unsubscribe = subscribe((state) => {
        const currentQuery = state.search.activeTab === 'globalData' ? state.search.query : '';
        if (currentQuery !== lastSearchQuery) {
          render();
        }
      });
    }

    isRendering = false;
  }

  render();
}

function renderDataItems(data, sectionIdx, parentKey = '', query = '', caseSensitive = false, isSearching = false) {
  if (Array.isArray(data)) {
    return `
      <div class="global-data-items">
        ${data.map((item, idx) => {
          const itemKey = `${parentKey}[${idx}]`;
          return renderDataItem(itemKey, item, sectionIdx, query, caseSensitive, isSearching);
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

  // Check if this item's subtree contains search matches
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
