import { fetchRecords, deleteRecord } from '../api.js';
import { parsePayload, computeMetrics } from '../../lib/index.js';
import { fetchRecord } from '../api.js';
import { update } from '../state.js';

let currentPage = 1;
let currentSort = 'call_start_ts';
let currentOrder = 'desc';
let currentFilters = {};
let searchTimeout = null;

function formatDuration(sec) {
  if (sec == null) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function ratingBadgeClass(rating) {
  switch (rating) {
    case 'Excellent': return 'badge-success';
    case 'Good': return 'badge-info';
    case 'Fair': return 'badge-warning';
    case 'Needs Improvement': return 'badge-error';
    default: return 'badge-ghost';
  }
}

function aiResultBadgeClass(result) {
  switch (result) {
    case 'success': return 'badge-success';
    case 'failed': return 'badge-error';
    default: return 'badge-ghost';
  }
}

function endedByBadgeClass(ended) {
  switch (ended) {
    case 'user': return 'badge-success';
    case 'assistant': return 'badge-warning';
    case 'system': return 'badge-info';
    default: return 'badge-ghost';
  }
}

export async function renderRecordBrowser(container) {
  container.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <div class="navbar bg-base-200 border-b border-base-300 px-4 gap-3 min-h-fit py-2">
        <button class="btn btn-ghost btn-sm" id="browse-back">&#x2190; Home</button>
        <div class="flex items-center gap-2">
          <span class="text-xl">&#x1F967;</span>
          <div>
            <span class="font-semibold">P.I.E.</span>
            <span class="text-xs opacity-50 ml-1">PostPrompt Ingestion Engine</span>
          </div>
        </div>
        <div id="browse-stats" class="ml-auto flex gap-3 text-xs opacity-60"></div>
      </div>

      <div class="p-4 space-y-4 flex-1">
        <!-- Search and Filters -->
        <div class="card bg-base-200 shadow-sm">
          <div class="card-body p-4">
            <div class="flex flex-wrap gap-3 items-end">
              <div class="form-control flex-1 min-w-[200px]">
                <label class="label py-0"><span class="label-text text-xs">Search</span></label>
                <label class="input input-bordered input-sm flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input type="text" class="grow" placeholder="Call ID, phone, app name..." id="browse-search" />
                </label>
              </div>
              <div class="form-control">
                <label class="label py-0"><span class="label-text text-xs">AI Result</span></label>
                <select class="select select-bordered select-sm" id="filter-ai-result">
                  <option value="">All</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label py-0"><span class="label-text text-xs">Performance</span></label>
                <select class="select select-bordered select-sm" id="filter-performance">
                  <option value="">All</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Needs Improvement">Needs Improvement</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label py-0"><span class="label-text text-xs">Ended By</span></label>
                <select class="select select-bordered select-sm" id="filter-ended-by">
                  <option value="">All</option>
                  <option value="user">User</option>
                  <option value="assistant">Assistant</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div class="form-control">
                <label class="label py-0"><span class="label-text text-xs">Direction</span></label>
                <select class="select select-bordered select-sm" id="filter-direction">
                  <option value="">All</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Table -->
        <div class="overflow-x-auto rounded-box border border-base-300 bg-base-200">
          <table class="table table-sm" id="browse-table">
            <thead>
              <tr class="bg-base-300">
                <th class="cursor-pointer" data-sort="call_start_ts">Time &#x25BC;</th>
                <th>Call ID</th>
                <th>App</th>
                <th class="cursor-pointer" data-sort="call_duration_sec">Duration</th>
                <th>From</th>
                <th>To</th>
                <th class="cursor-pointer" data-sort="ai_result">Result</th>
                <th class="cursor-pointer" data-sort="performance_rating">Perf</th>
                <th>Ended</th>
                <th class="cursor-pointer" data-sort="turn_count">Turns</th>
                <th class="cursor-pointer" data-sort="avg_latency_ms">Latency</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="browse-body">
              <tr><td colspan="12" class="text-center py-8 opacity-50"><span class="loading loading-dots loading-md"></span></td></tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between" id="browse-pagination"></div>
      </div>
    </div>
  `;

  // Back button
  container.querySelector('#browse-back').addEventListener('click', () => {
    update({ browseMode: false });
  });

  // Sort headers
  container.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort === field) {
        currentOrder = currentOrder === 'desc' ? 'asc' : 'desc';
      } else {
        currentSort = field;
        currentOrder = 'desc';
      }
      currentPage = 1;
      loadRecords(container);
    });
  });

  // Search
  container.querySelector('#browse-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentFilters.q = e.target.value;
      currentPage = 1;
      loadRecords(container);
    }, 300);
  });

  // Filter selects
  const filterMap = {
    'filter-ai-result': 'ai_result',
    'filter-performance': 'performance_rating',
    'filter-ended-by': 'call_ended_by',
    'filter-direction': 'call_direction',
  };
  for (const [id, param] of Object.entries(filterMap)) {
    container.querySelector(`#${id}`).addEventListener('change', (e) => {
      currentFilters[param] = e.target.value;
      currentPage = 1;
      loadRecords(container);
    });
  }

  // Initial load
  loadRecords(container);
  loadStats(container);
}

async function loadStats(container) {
  try {
    const { fetchStats } = await import('../api.js');
    const stats = await fetchStats();
    const el = container.querySelector('#browse-stats');
    if (el) {
      el.innerHTML = `
        <span>${stats.total_records} records</span>
        <span>${stats.total_calls_today} today</span>
        ${stats.avg_duration_sec ? `<span>avg ${formatDuration(stats.avg_duration_sec)}</span>` : ''}
        ${stats.avg_latency_ms ? `<span>avg ${stats.avg_latency_ms}ms</span>` : ''}
      `;
    }
  } catch {}
}

async function loadRecords(container) {
  const body = container.querySelector('#browse-body');
  body.innerHTML = `<tr><td colspan="12" class="text-center py-8 opacity-50"><span class="loading loading-dots loading-md"></span></td></tr>`;

  try {
    const data = await fetchRecords({
      page: currentPage,
      per_page: 25,
      sort: currentSort,
      order: currentOrder,
      ...currentFilters,
    });

    if (data.records.length === 0) {
      body.innerHTML = `
        <tr><td colspan="12" class="text-center py-12">
          <div class="text-3xl mb-2">&#x1F967;</div>
          <div class="font-medium">No records found</div>
          <div class="text-xs opacity-50 mt-1">Ingest some post-prompt data or adjust your filters</div>
        </td></tr>
      `;
    } else {
      body.innerHTML = data.records.map(r => `
        <tr class="hover cursor-pointer record-row" data-call-id="${r.call_id}">
          <td class="text-xs whitespace-nowrap">${formatDate(r.call_start_ts)}</td>
          <td class="font-mono text-xs">${truncate(r.call_id, 12)}</td>
          <td class="text-xs">${r.app_name || '-'}</td>
          <td class="text-xs font-mono">${formatDuration(r.call_duration_sec)}</td>
          <td class="text-xs">${r.caller_id_number || '-'}</td>
          <td class="text-xs">${r.to_number || '-'}</td>
          <td><div class="badge ${aiResultBadgeClass(r.ai_result)} badge-xs">${r.ai_result || '-'}</div></td>
          <td><div class="badge ${ratingBadgeClass(r.performance_rating)} badge-xs">${r.performance_rating || '-'}</div></td>
          <td><div class="badge ${endedByBadgeClass(r.call_ended_by)} badge-xs">${r.call_ended_by || '-'}</div></td>
          <td class="text-xs text-center">${r.turn_count ?? '-'}</td>
          <td class="text-xs font-mono">${r.avg_latency_ms ? Math.round(r.avg_latency_ms) + 'ms' : '-'}</td>
          <td>
            <button class="btn btn-ghost btn-xs text-error delete-btn" data-call-id="${r.call_id}" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </td>
        </tr>
      `).join('');
    }

    // Pagination
    const pag = container.querySelector('#browse-pagination');
    if (data.pages > 1) {
      pag.innerHTML = `
        <span class="text-xs opacity-60">${data.total} records, page ${data.page} of ${data.pages}</span>
        <div class="join">
          ${data.page > 1 ? `<button class="join-item btn btn-sm" id="page-prev">&#x25C0;</button>` : ''}
          ${Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
            const p = data.pages <= 7 ? i + 1 : (
              data.page <= 4 ? i + 1 :
              data.page >= data.pages - 3 ? data.pages - 6 + i :
              data.page - 3 + i
            );
            return `<button class="join-item btn btn-sm ${p === data.page ? 'btn-active btn-primary' : ''}" data-page="${p}">${p}</button>`;
          }).join('')}
          ${data.page < data.pages ? `<button class="join-item btn btn-sm" id="page-next">&#x25B6;</button>` : ''}
        </div>
      `;
      pag.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          currentPage = parseInt(btn.dataset.page);
          loadRecords(container);
        });
      });
      pag.querySelector('#page-prev')?.addEventListener('click', () => { currentPage--; loadRecords(container); });
      pag.querySelector('#page-next')?.addEventListener('click', () => { currentPage++; loadRecords(container); });
    } else {
      pag.innerHTML = data.total > 0 ? `<span class="text-xs opacity-60">${data.total} records</span>` : '';
    }

    // Row click → load into viewer
    container.querySelectorAll('.record-row').forEach(row => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('.delete-btn')) return;
        const callId = row.dataset.callId;
        try {
          row.classList.add('opacity-50');
          const detail = await fetchRecord(callId);
          const payload = parsePayload(detail.raw_payload);
          const metrics = computeMetrics(payload);
          update({
            payload, metrics,
            activeTab: 'dashboard',
            viewMode: 'postprompt',
            browseMode: false,
            recordSource: 'database',
            currentRecordCallId: callId,
          });
        } catch (err) {
          row.classList.remove('opacity-50');
          console.error('Failed to load record:', err);
        }
      });
    });

    // Delete buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const callId = btn.dataset.callId;
        if (!confirm(`Delete record ${callId.slice(0, 12)}...?`)) return;
        try {
          await deleteRecord(callId);
          loadRecords(container);
          loadStats(container);
        } catch (err) {
          console.error('Failed to delete:', err);
        }
      });
    });

  } catch (err) {
    body.innerHTML = `
      <tr><td colspan="12" class="text-center py-8">
        <div class="text-error text-sm">${err.message}</div>
        <div class="text-xs opacity-50 mt-1">Is the P.I.E. backend running?</div>
      </td></tr>
    `;
  }
}
