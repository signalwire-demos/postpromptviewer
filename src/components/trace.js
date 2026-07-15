import { cleanText, formatMs } from '../../lib/utils.js';
import { escapeHtml } from '../../lib/search-filter.js';
import { MILESTONE_LABELS } from '../../lib/metrics/trace.js';

// Brand palette: turquoise turn-detect, purple LLM, gold TTS, blue audio
const STAGE_COLORS = {
  speaking: 'rgba(34, 197, 94, 0.75)',
  'turn-detect': 'rgba(64, 224, 208, 0.75)',
  poll: 'rgba(148, 163, 184, 0.6)',
  llm: 'rgba(96, 27, 230, 0.8)',
  tts: 'rgba(255, 215, 0, 0.75)',
  audio: 'rgba(4, 78, 244, 0.75)',
  filler: 'rgba(255, 215, 0, 0.45)',
  other: 'rgba(115, 115, 126, 0.5)',
};

const STAGE_TITLES = {
  speaking: 'Caller speaking',
  'turn-detect': 'Turn detection',
  poll: 'ASR poll gap',
  llm: 'Model (to first token)',
  tts: 'Utterance ready',
  audio: 'First audio frame',
  filler: 'Filler onset',
  other: '',
};

const SPEED_LABELS = { fast: 'fast', ok: 'ok', slow: 'slow' };

const HERO_LABELS = {
  'mouth-to-ear': 'mouth-to-ear',
  'acoustic-field': 'acoustic (field)',
  'to-first-audio': 'to first audio',
};

function chipHtml(text, cls = '') {
  return `<span class="trace__chip ${cls}">${text}</span>`;
}

function callerChips(user) {
  if (!user) return '';
  const chips = [];
  if (user.contentType === 'DTMF') chips.push(chipHtml('DTMF', 'trace__chip--dtmf'));
  if (user.confidence != null) chips.push(chipHtml(`${(user.confidence * 100).toFixed(0)}%`));
  if (user.entity && user.entity.value) {
    chips.push(chipHtml(
      `${user.entity.valid ? '✓' : '✕'} ${escapeHtml(user.entity.type)}: ${escapeHtml(user.entity.value)}`,
      user.entity.valid ? 'trace__chip--good' : 'trace__chip--bad'
    ));
  }
  if (user.timing?.commit_latency_ms != null) chips.push(chipHtml(`commit ${user.timing.commit_latency_ms}ms`));
  if (user.timingsInferred) chips.push(chipHtml('~timing estimated', 'trace__chip--dim'));
  return chips.join('');
}

function barHtml(ex) {
  if (!ex.stages.length) return '';
  const segments = ex.stages.map(s => `
    <div class="trace__bar-seg" style="left:${s.x}%;width:${Math.max(s.w, 0.4)}%;background:${STAGE_COLORS[s.cat]}"
         title="${STAGE_TITLES[s.cat]}: ${MILESTONE_LABELS[s.from]} → ${MILESTONE_LABELS[s.to]} · ${s.ms}ms"></div>
  `).join('');
  const key = ex.stages.map(s => `
    <span class="trace__key-item">
      <span class="trace__key-dot" style="background:${STAGE_COLORS[s.cat]}"></span>
      ${MILESTONE_LABELS[s.to]} ${formatMs(s.ms)}
    </span>
  `).join('');
  return `
    <div class="trace__bar">${segments}</div>
    <div class="trace__key">${key}</div>
  `;
}

function toolsHtml(ex, gi) {
  if (!ex.tools.length) return '';
  return ex.tools.map((t, ti) => {
    let argsPretty = t.args;
    try { argsPretty = JSON.stringify(JSON.parse(t.args), null, 2); } catch { /* keep raw */ }
    return `
      <details class="trace__tool">
        <summary>
          <code>${escapeHtml(t.name)}</code>
          ${t.executionMs != null ? `<span class="trace__chip">${formatMs(t.executionMs)}</span>` : ''}
          ${t.native ? '<span class="trace__chip trace__chip--dim">native</span>' : ''}
          ${t.distilled ? '<span class="trace__chip trace__chip--dim">distilled</span>' : ''}
        </summary>
        <div class="trace__tool-body" id="trace-tool-${gi}-${ti}">
          ${argsPretty ? `<div class="trace__tool-label">Arguments</div><pre>${escapeHtml(argsPretty)}</pre>` : ''}
          ${t.result ? `<div class="trace__tool-label">Result</div><pre>${escapeHtml(t.result)}</pre>` : ''}
          ${t.url ? `<div class="trace__tool-label">URL</div><pre>${escapeHtml(t.url)}</pre>` : ''}
          ${t.postResponse ? `<div class="trace__tool-label">post_response</div><pre>${escapeHtml(JSON.stringify(t.postResponse, null, 2))}</pre>` : ''}
        </div>
      </details>
    `;
  }).join('');
}

export function renderTrace(container, payload, metrics) {
  const trace = metrics.trace;
  if (!trace || !trace.exchanges.length) {
    container.innerHTML = '<div class="trace"><p style="color:var(--text-muted);padding:1.5rem">No conversation exchanges found.</p></div>';
    return;
  }

  const stats = trace.stats;
  const statsHtml = stats ? `
    <div class="trace__stats">
      <div class="trace__stat"><span class="trace__stat-value">${formatMs(stats.avg)}</span><span class="trace__stat-label">avg mouth-to-ear</span></div>
      <div class="trace__stat"><span class="trace__stat-value">${formatMs(stats.median)}</span><span class="trace__stat-label">median</span></div>
      <div class="trace__stat"><span class="trace__stat-value">${formatMs(stats.p95)}</span><span class="trace__stat-label">p95</span></div>
      <div class="trace__stat"><span class="trace__stat-value">${formatMs(stats.max)}</span><span class="trace__stat-label">slowest</span></div>
      <div class="trace__stat"><span class="trace__stat-value">${stats.count}</span><span class="trace__stat-label">measured turns</span></div>
    </div>
  ` : '';

  const cards = trace.exchanges.map((ex, gi) => `
    <div class="trace__card trace__card--${ex.speed}">
      ${ex.user ? `
        <div class="trace__caller">
          <span class="trace__who">Caller</span>
          <span class="trace__caller-text">${escapeHtml(cleanText(ex.user.text))}</span>
          ${callerChips(ex.user)}
        </div>
      ` : `
        <div class="trace__caller trace__caller--none"><span class="trace__who">—</span><span class="trace__caller-text trace__chip--dim">(no caller turn — greeting / timeout)</span></div>
      `}
      ${ex.heroMs != null ? `
        <div class="trace__hero">
          <span class="trace__hero-ms trace__hero-ms--${ex.speed}">${formatMs(ex.heroMs)}</span>
          <span class="trace__hero-label">${HERO_LABELS[ex.heroKind] || ''}</span>
          <span class="trace__chip trace__chip--${ex.speed}">${SPEED_LABELS[ex.speed] || ''}</span>
          ${ex.barged ? '<span class="trace__chip trace__chip--bad">interrupted</span>' : ''}
        </div>
      ` : ''}
      ${ex.verdict ? `<div class="trace__verdict trace__verdict--${ex.verdict.kind}">${ex.verdict.icon} ${escapeHtml(ex.verdict.text)}</div>` : ''}
      ${barHtml(ex)}
      ${ex.fillers.length ? `<div class="trace__fillers">${ex.fillers.map(f => `<span class="trace__chip trace__chip--filler">🕐 ${escapeHtml(cleanText(f))}</span>`).join('')}</div>` : ''}
      ${toolsHtml(ex, gi)}
      ${ex.replyText ? `
        <div class="trace__reply">
          <span class="trace__who">Agent</span>
          <span class="trace__reply-text">${escapeHtml(cleanText(ex.replyText))}</span>
        </div>
      ` : ''}
    </div>
  `).join('');

  container.innerHTML = `
    <div class="trace">
      ${statsHtml}
      <div class="trace__cards">${cards}</div>
      ${trace.exchanges.some(e => e.stages.length) ? '' : `
        <p style="color:var(--text-muted);font-size:0.8rem;padding:0 1.5rem 1rem">
          No stamps_us pipeline data on this call — per-stage bars appear on calls from newer agents.
        </p>
      `}
    </div>
  `;
}
