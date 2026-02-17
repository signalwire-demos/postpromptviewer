import { debounce, matchesSearch, highlightMatches, searchInObject, escapeHtml } from '../../lib/search-filter.js';
import { getState, update, subscribe } from '../state.js';

export function renderSwaigInspector(container, payload) {
  let unsubscribe = null;
  let isRendering = false;
  let lastSearchQuery = '';

  function applySearch(entries) {
    const { search } = getState();

    if (!search.query || search.activeTab !== 'swaig') {
      return entries;
    }

    return entries.filter(entry => {
      // Search in command name
      if (matchesSearch(entry.command_name || '', search.query, search.caseSensitive)) {
        return true;
      }

      // Search in native command arg
      if (entry.native && entry.command_arg) {
        if (matchesSearch(entry.command_arg, search.query, search.caseSensitive)) {
          return true;
        }
      }

      // Search in post_data (deep search)
      if (entry.post_data && searchInObject(entry.post_data, search.query, search.caseSensitive)) {
        return true;
      }

      // Search in post_response (deep search)
      if (entry.post_response && searchInObject(entry.post_response, search.query, search.caseSensitive)) {
        return true;
      }

      return false;
    });
  }

  function renderSearchBar(totalEntries, filteredCount) {
    const { search } = getState();
    const isSearching = search.query && search.activeTab === 'swaig';

    return `
      <div class="search-filter-bar">
        <div class="search-filter-bar__filters">
          ${isSearching ? `
            <span style="font-size: 0.875rem; color: var(--text-secondary);">
              ${filteredCount} of ${totalEntries} entries
            </span>
          ` : ''}
        </div>
        <div class="search-filter-bar__search">
          <div class="search-box">
            <input
              type="text"
              class="search-box__input"
              id="swaig-search-input"
              placeholder="Search SWAIG commands..."
              value="${search.activeTab === 'swaig' ? search.query : ''}"
              aria-label="Search SWAIG commands"
            />
            ${search.query && search.activeTab === 'swaig' ? `
              <button class="search-box__clear" id="clear-swaig-search" aria-label="Clear search">
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

    const entries = payload.swaigLog;

    if (!entries.length) {
      container.innerHTML = '<div class="swaig-inspector"><p style="color:var(--text-muted)">No SWAIG function calls recorded</p></div>';
      isRendering = false;
      return;
    }

    const filteredEntries = applySearch(entries);
    const { search } = getState();
    lastSearchQuery = search.activeTab === 'swaig' ? search.query : '';
    const isSearching = search.query && search.activeTab === 'swaig';

    const entriesHtml = filteredEntries.map((entry, idx) => {
      const name = entry.command_name || 'unknown';
      const time = entry.epoch_time
        ? new Date(entry.epoch_time * 1000).toLocaleTimeString()
        : '';
      const isNative = entry.native === true;

      // Highlight command name if searching
      const displayName = isSearching
        ? highlightMatches(name, search.query, search.caseSensitive)
        : escapeHtml(name);

      let bodyHtml = '';
      if (isNative) {
        const commandArg = entry.command_arg || 'null';
        bodyHtml = `
          <div class="swaig-entry__section">
            <div class="swaig-entry__section-header">
              <span class="swaig-entry__section-title">Native Command</span>
              <button class="swaig-entry__copy-btn" data-copy="${escapeHtml(commandArg)}" title="Copy">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div class="swaig-entry__json">${escapeHtml(commandArg)}</div>
          </div>
        `;
      } else {
        const postDataHtml = entry.post_data
          ? `<div class="swaig-entry__section">
              <div class="swaig-entry__section-header">
                <span class="swaig-entry__section-title">Request (post_data)</span>
                <button class="swaig-entry__copy-btn" data-copy="${escapeHtml(formatJson(entry.post_data))}" title="Copy JSON">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <pre class="swaig-entry__json">${escapeHtml(formatJson(entry.post_data))}</pre>
            </div>` : '';
        const postResponseHtml = entry.post_response
          ? `<div class="swaig-entry__section">
              <div class="swaig-entry__section-header">
                <span class="swaig-entry__section-title">Response (post_response)</span>
                <button class="swaig-entry__copy-btn" data-copy="${escapeHtml(formatJson(entry.post_response))}" title="Copy JSON">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <pre class="swaig-entry__json">${escapeHtml(formatJson(entry.post_response))}</pre>
            </div>` : '';
        bodyHtml = postDataHtml + postResponseHtml;
      }

      // Full entry JSON for copy all button
      const fullEntryJson = formatJson(entry);

      // Auto-expand if searching
      const autoExpand = isSearching ? 'open' : '';

      return `
        <div class="swaig-entry ${autoExpand}" id="swaig-${idx}">
          <div class="swaig-entry__header" data-idx="${idx}">
            <div>
              <span class="swaig-entry__arrow">&#x25B6;</span>
              <span class="swaig-entry__name">${displayName}</span>
              ${isNative ? '<span style="font-size:0.7rem;color:var(--text-muted)">(native)</span>' : ''}
              <span class="swaig-entry__time">${time}</span>
            </div>
            <button class="swaig-entry__copy-all" data-copy="${escapeHtml(fullEntryJson)}" title="Copy entire entry">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="swaig-entry__body">${bodyHtml}</div>
        </div>
      `;
    }).join('');

    // Save focus state before innerHTML wipes the DOM
    const focusedId = document.activeElement?.id;
    const selStart = document.activeElement?.selectionStart ?? null;
    const selEnd = document.activeElement?.selectionEnd ?? null;

    container.innerHTML = `
      <div class="swaig-inspector">
        ${renderSearchBar(entries.length, filteredEntries.length)}
        ${filteredEntries.length > 0 ? entriesHtml : `
          <div class="filter-empty">
            <div class="filter-empty__icon">🔍</div>
            <div class="filter-empty__title">No SWAIG entries match your search</div>
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
    const searchInput = container.querySelector('#swaig-search-input');
    if (searchInput) {
      const debouncedSearch = debounce((value) => {
        update({
          search: {
            ...getState().search,
            query: value,
            activeTab: value ? 'swaig' : null,
            currentMatch: 0
          }
        });
      }, 300);

      searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    }

    // Clear search button
    const clearBtn = container.querySelector('#clear-swaig-search');
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

    // Accordion toggle
    container.querySelectorAll('.swaig-entry__header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.swaig-entry__copy-all')) return;
        const entry = document.getElementById(`swaig-${header.dataset.idx}`);
        entry.classList.toggle('open');
      });
    });

    // Copy button handlers
    const addCopyHandler = (selector) => {
      container.querySelectorAll(selector).forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const textToCopy = btn.dataset.copy;
          navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `
              <svg width="${selector.includes('copy-all') ? '14' : '12'}" height="${selector.includes('copy-all') ? '14' : '12'}" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            `;
            setTimeout(() => {
              btn.innerHTML = originalHtml;
            }, 2000);
          });
        });
      });
    };

    addCopyHandler('.swaig-entry__copy-btn');
    addCopyHandler('.swaig-entry__copy-all');

    // Subscribe to state changes (only set up once)
    if (!unsubscribe) {
      unsubscribe = subscribe((state) => {
        const currentQuery = state.search.activeTab === 'swaig' ? state.search.query : '';
        if (currentQuery !== lastSearchQuery) {
          render();
        }
      });
    }

    isRendering = false;
  }

  render();
}


function formatJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}
