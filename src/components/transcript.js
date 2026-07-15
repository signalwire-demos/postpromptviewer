import { epochToDate, formatTimestamp, truncate, fieldsOf, measuredMs, cleanText } from '../../lib/utils.js';
import { debounce, matchesSearch, highlightMatches, scrollToElement, escapeHtml } from '../../lib/search-filter.js';
import { getState, update, subscribe } from '../state.js';


// Labels for non-standard/non-printable whitespace characters
const GARBAGE_CHAR_LABELS = {
  '\u00a0': 'NBSP',
  '\u200b': 'ZWS',
  '\u200c': 'ZWNJ',
  '\u200d': 'ZWJ',
  '\u2000': 'NQSP',
  '\u2001': 'MQSP',
  '\u2002': 'ENSP',
  '\u2003': 'EMSP',
  '\u2004': '3MSP',
  '\u2005': '4MSP',
  '\u2006': '6MSP',
  '\u2007': 'FSP',
  '\u2008': 'PSP',
  '\u2009': 'THSP',
  '\u200a': 'HSP',
  '\u202f': 'NNBSP',
  '\u205f': 'MMSP',
  '\u3000': 'IDSP',
  '\ufeff': 'BOM',
};

const GARBAGE_CHAR_PATTERN = /[\u00a0\u200b-\u200d\u2000-\u200a\u202f\u205f\u3000\ufeff]/g;

/**
 * Detect garbage model output — content containing non-standard Unicode whitespace
 * characters that indicate the TTS/model produced malformed output.
 */
function isGarbageContent(content) {
  if (typeof content !== 'string') return false;
  GARBAGE_CHAR_PATTERN.lastIndex = 0;
  return GARBAGE_CHAR_PATTERN.test(content);
}

/**
 * Replace non-standard whitespace characters with visible inline badges
 * so garbage model output is clearly visible on screen.
 */
function renderVisibleWhitespace(content, escapeHtmlFn) {
  const pattern = /[\u00a0\u200b-\u200d\u2000-\u200a\u202f\u205f\u3000\ufeff]/g;
  let result = '';
  let lastIdx = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    result += escapeHtmlFn(content.slice(lastIdx, match.index));
    const char = match[0];
    const label = GARBAGE_CHAR_LABELS[char] ||
      `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    const title = `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    result += `<span class="ws-char" title="${title}">${label}</span>`;
    lastIdx = match.index + 1;
  }

  result += escapeHtmlFn(content.slice(lastIdx));
  return result;
}

/**
 * Calculate response time rating based on latency
 * @param {number} latency - Latency in milliseconds
 * @returns {Object} Rating info with name, class, and color
 */
function getResponseTimeRating(latency) {
  if (latency == null) return null;

  if (latency < 1200) {
    return {
      name: 'Excellent',
      class: 'excellent',
      color: '#22c55e'
    };
  } else if (latency < 1800) {
    return {
      name: 'Good',
      class: 'good',
      color: '#044EF4'
    };
  } else if (latency < 2500) {
    return {
      name: 'Fair',
      class: 'fair',
      color: '#FFD700'
    };
  } else {
    return {
      name: 'Needs Improvement',
      class: 'needs-improvement',
      color: '#ef4444'
    };
  }
}

/**
 * The latency to rate a message by. Assistant: prefer the user-perceived
 * acoustic_latency, fall back to audio/utterance/TTFT (null and the 0
 * sentinel are "not measured"). Tool: the function's real execution time
 * (end − start µs) — the execution_latency/function_latency aliases carry
 * the surrounding turn's latency, not the tool's own.
 */
function responseLatencyOf(msg) {
  if (msg.role === 'assistant' || msg.role === 'assistant-manual') {
    return measuredMs(msg.acoustic_latency) ?? measuredMs(msg.audio_latency) ??
      measuredMs(msg.utterance_latency) ?? measuredMs(msg.latency);
  }
  if (msg.role === 'tool') {
    if (msg.start_timestamp && msg.end_timestamp) {
      return Math.round((msg.end_timestamp - msg.start_timestamp) / 1000);
    }
    return null;
  }
  return measuredMs(msg.latency);
}

/**
 * Format inner dialog content into structured sections.
 * Splits on ## headers and renders each as a labeled block.
 */
function formatInnerDialog(content) {
  if (!content || typeof content !== 'string') return '<span class="inner-dialog-section__content">No content</span>';

  const sections = content.split(/^## /m).filter(Boolean);
  if (sections.length <= 1 && !content.startsWith('## ')) {
    // No section headers found — render as plain text
    return `<div class="inner-dialog-section"><div class="inner-dialog-section__content">${escapeHtml(content)}</div></div>`;
  }

  return sections.map(section => {
    const lines = section.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    // Detect confidence scores like "Confidence: 0.9" or "confidence: high"
    const confidenceMatch = body.match(/confidence[:\s]+([^\n]+)/i);
    return `
      <div class="inner-dialog-section">
        <div class="inner-dialog-section__title">${escapeHtml(title)}</div>
        <div class="inner-dialog-section__content">${escapeHtml(body)}</div>
        ${confidenceMatch ? `<span class="inner-dialog-confidence">${escapeHtml(confidenceMatch[1].trim())}</span>` : ''}
      </div>`;
  }).join('');
}

export function renderTranscript(container, payload) {
  let activeLog = 'processed';
  let unsubscribe = null;
  let isRendering = false;
  let lastState = null;
  let keyboardHandler = null;

  function applyFilters(messages) {
    const { search, filters } = getState();
    const activeFilters = filters.transcript;

    return messages.filter(msg => {
      // Role filter (OR logic - if any roles selected, must match one)
      if (activeFilters.roles.length > 0) {
        if (!activeFilters.roles.includes(msg.role)) return false;
      }

      // Barge filter
      if (activeFilters.hasBarge && !msg.barge_count) return false;

      // Merge filter
      if (activeFilters.hasMerge && !msg.merge_count && !msg.merged) return false;

      // Tool calls filter
      if (activeFilters.hasToolCalls && (!msg.tool_calls || msg.tool_calls.length === 0)) return false;

      // Garbage response filter
      if (activeFilters.hasGarbage && !isGarbageContent(msg.content)) return false;

      // Interrupted (barged) filter
      if (activeFilters.hasInterrupted && !(msg.barged ?? msg.metadata?.barged)) return false;

      // Response time rating filter
      if (activeFilters.responseTimeRating) {
        const rating = getResponseTimeRating(responseLatencyOf(msg));
        if (!rating || rating.class !== activeFilters.responseTimeRating) {
          return false;
        }
      }

      // Search query
      if (search.query && search.activeTab === 'transcript') {
        const content = msg.content || '';
        const toolCallsText = msg.tool_calls ? msg.tool_calls.map(tc => `${tc.function.name}(${tc.function.arguments})`).join(' ') : '';
        const searchableText = content + ' ' + toolCallsText;

        if (!matchesSearch(searchableText, search.query, search.caseSensitive)) {
          return false;
        }
      }

      return true;
    });
  }

  // Build lookup maps for enriched events that annotate messages.
  // fieldsOf() handles both system-log shapes: nested `metadata` (most
  // actions) and flat top-level keys (function_error, function_loop,
  // swaig_problem, change_step_failed, double_turn, inner_dialog,
  // inner_dialog_scorecard).
  const enrichedEvents = { hearingHints: [], pronounceRules: [], fillers: [], manualSays: [], functionErrors: [], functionProblems: [], autoCorrects: [], innerDialogs: [], textNormalizeItn: [] };
  (payload.callLog || []).forEach(entry => {
    if (entry.role !== 'system-log' || !entry.action) return;
    const m = fieldsOf(entry);
    switch (entry.action) {
      case 'hearing_hint':
        enrichedEvents.hearingHints.push({ timestamp: entry.timestamp, original: m.original || '', result: m.result || '' });
        break;
      case 'filler':
        enrichedEvents.fillers.push({ timestamp: entry.timestamp, text: m.text || 'thinking...' });
        break;
      case 'manual_say':
        enrichedEvents.manualSays.push({ timestamp: entry.timestamp, text: m.text || entry.content || '', isError: m.is_error || false, errorReason: m.error_reason || null });
        break;
      case 'function_error':
        // Production shape: function + error ("non-existent function" |
        // "invalid parameters") + details (schema-validation text)
        enrichedEvents.functionErrors.push({ timestamp: entry.timestamp, functionName: m.function || 'unknown', errorType: m.error || 'unknown', errorMessage: m.details || null });
        break;
      case 'function_loop':
        enrichedEvents.functionProblems.push({ timestamp: entry.timestamp, label: 'Function Loop', functionName: m.function || 'unknown', detail: m.type ? `${m.type} loop broken` : 'loop broken' });
        break;
      case 'swaig_problem':
        enrichedEvents.functionProblems.push({ timestamp: entry.timestamp, label: 'SWAIG Problem', functionName: m.function || 'unknown', detail: m.error || 'problem response' });
        break;
      case 'change_step_failed':
        enrichedEvents.functionProblems.push({ timestamp: entry.timestamp, label: 'Step Change Failed', functionName: m.name || 'unknown', detail: 'step not found' });
        break;
      case 'auto_correct':
        enrichedEvents.autoCorrects.push({ timestamp: entry.timestamp, original: m.original || '', corrected: m.corrected || '' });
        break;
      case 'double_turn':
        enrichedEvents.innerDialogs.push({ timestamp: entry.timestamp, content: entry.content || '', label: 'Double Turn Directive' });
        break;
      case 'inner_dialog':
      case 'inner_dialog_scorecard':
        enrichedEvents.innerDialogs.push({ timestamp: entry.timestamp, content: entry.content || '', label: entry.action === 'inner_dialog_scorecard' ? 'Inner Dialog Scorecard' : 'Inner Dialog' });
        break;
    }
  });

  // ITN and pronounce/TN rewrites are NOT system-log entries — they surface
  // only as synthetic text_normalize / pronounce events in call_timeline.
  (payload.callTimeline || []).forEach(entry => {
    if (!entry.ts) return;
    if (entry.type === 'pronounce') {
      enrichedEvents.pronounceRules.push({ timestamp: entry.ts, original: entry.original || '', result: entry.result || '' });
    } else if (entry.type === 'text_normalize') {
      enrichedEvents.textNormalizeItn.push({ timestamp: entry.ts, original: entry.original || '', normalized: entry.normalized || '' });
    }
  });
  enrichedEvents.pronounceRules.sort((a, b) => a.timestamp - b.timestamp);
  enrichedEvents.textNormalizeItn.sort((a, b) => a.timestamp - b.timestamp);

  function buildMessagesHtml(messages) {
    const { search } = getState();
    const isSearching = search.query && search.activeTab === 'transcript';

    // Sort enriched inline events to interleave with messages
    const inlineEvents = [];
    enrichedEvents.fillers.forEach(f => inlineEvents.push({ ...f, _type: 'filler' }));
    enrichedEvents.manualSays.forEach(s => inlineEvents.push({ ...s, _type: 'manual_say' }));
    enrichedEvents.functionErrors.forEach(e => inlineEvents.push({ ...e, _type: 'function_error' }));
    enrichedEvents.functionProblems.forEach(e => inlineEvents.push({ ...e, _type: 'function_problem' }));
    enrichedEvents.innerDialogs.forEach(d => inlineEvents.push({ ...d, _type: 'inner_dialog' }));
    inlineEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Track which hearing hints have been consumed
    let hintIdx = 0;
    // Track which pronounce rules have been consumed
    let pronounceIdx = 0;
    // Track which auto-corrects have been consumed
    let autoCorrectIdx = 0;
    // Track which text_normalize (ITN) events have been consumed
    let itnIdx = 0;
    // Track inline event cursor
    let inlineIdx = 0;

    return messages.map((msg, idx) => {
      const role = msg.role || 'unknown';
      const roleClass = role.replace(/[^a-z-]/g, '');
      const isGarbage = isGarbageContent(msg.content);
      const time = msg.timestamp ? formatTimestamp(epochToDate(msg.timestamp)) : '';
      const { showRedacted } = getState();
      // cleanText strips inline ~LN(...)-; TTS language directives
      const contentDisplay = cleanText((showRedacted && msg.redacted) ? msg.redacted : (msg.content || ''));

      // Apply highlighting if searching; show visible badges for garbage chars
      const displayContent = isGarbage
        ? renderVisibleWhitespace(contentDisplay, escapeHtml)
        : (isSearching
          ? highlightMatches(contentDisplay, search.query, search.caseSensitive)
          : escapeHtml(contentDisplay));

      // Metadata tags
      const metaTags = [];

      // Add response time rating for assistant and tool messages
      if (role === 'assistant' || role === 'tool') {
        const rating = getResponseTimeRating(responseLatencyOf(msg));
        if (rating) {
          metaTags.push({
            text: `⏱️ ${rating.name}`,
            class: `rating-${rating.class}`,
            color: rating.color
          });
        }
      }

      // Latency tiers: null / 0 mean "not measured" — show only real values
      if (measuredMs(msg.latency) != null) metaTags.push(`ttft: ${msg.latency}ms`);
      if (measuredMs(msg.utterance_latency) != null) metaTags.push(`utterance: ${msg.utterance_latency}ms`);
      if (measuredMs(msg.audio_latency) != null) metaTags.push(`audio: ${msg.audio_latency}ms`);
      if (measuredMs(msg.acoustic_latency) != null) metaTags.push({ text: `acoustic: ${msg.acoustic_latency}ms`, class: 'acoustic' });
      if (measuredMs(msg.eos_to_push_latency) != null) metaTags.push(`turn-detect: ${msg.eos_to_push_latency}ms`);
      if (measuredMs(msg.poll) != null) metaTags.push(`poll: ${msg.poll}ms`);
      if (msg.confidence != null) metaTags.push(`confidence: ${(msg.confidence * 100).toFixed(1)}%`);
      if (msg.content_type === 'DTMF') metaTags.push({ text: '☎ DTMF', class: 'dtmf' });
      else if (msg.content_type) metaTags.push(msg.content_type);
      if (msg.speaker) metaTags.push({ text: `🗣 ${msg.speaker}`, class: 'speaker' });
      if (msg.barge_count) metaTags.push({ text: `🔴 barge-in ×${msg.barge_count}`, class: 'barge' });
      if (msg.merge_count) metaTags.push({ text: `🔀 merged ×${msg.merge_count}`, class: 'merge' });
      if (msg.merged && !msg.merge_count) metaTags.push({ text: '🔀 merged', class: 'merge' });
      if (role === 'tool') {
        // Real execution time; the exec/func fields on tool entries are
        // deprecated aliases of the surrounding turn's latency.
        const execMs = responseLatencyOf(msg);
        if (execMs != null) metaTags.push(`exec: ${execMs}ms`);
        if (msg.distilled) metaTags.push({ text: 'distilled', class: 'merge' });
      }
      if (msg.speaking_to_final_event != null) metaTags.push(`speak-to-final: ${msg.speaking_to_final_event}ms`);
      if (msg.timings_inferred) metaTags.push({ text: '~timing estimated', class: 'inferred' });

      // mod_deepgram turn telemetry (present only when the engine enriched
      // the final): entity capture, end-of-turn basis, hold/commit timing
      if (msg.entity && msg.entity.value) {
        metaTags.push({
          text: `${msg.entity.valid ? '✓' : '✕'} ${msg.entity.type}: ${msg.entity.value}`,
          class: msg.entity.valid ? 'entity-ok' : 'entity-bad',
        });
      }
      if (msg.eot && msg.eot.basis) {
        const conf = msg.eot.confidence != null ? ` ${(msg.eot.confidence * 100).toFixed(0)}%` : '';
        const lowConfidence = msg.eot.basis === 'ceiling' || (msg.eot.confidence != null && msg.eot.confidence < 0.6);
        metaTags.push({
          text: `eot: ${msg.eot.basis}${conf}${msg.eot.basis === 'ceiling' ? ' ⚠' : ''}`,
          class: lowConfidence ? 'eot-warn' : 'eot',
        });
      }
      if (msg.timing) {
        if (msg.timing.commit_latency_ms != null) metaTags.push(`commit: ${msg.timing.commit_latency_ms}ms`);
        if ((msg.timing.segments || 0) > 1) metaTags.push(`segments: ${msg.timing.segments}`);
        if ((msg.timing.walkbacks || 0) > 0) metaTags.push({ text: `walkbacks: ${msg.timing.walkbacks}`, class: 'eot-warn' });
      }
      if (isGarbage) metaTags.push({ text: '⚠️ Garbage Response', class: 'garbage' });

      // Barge-in on assistant response (caller interrupted this response)
      const msgBarged = (role === 'assistant') && (msg.barged ?? msg.metadata?.barged ?? false);
      const bargeElapsed = msg.barge_elapsed_ms ?? msg.metadata?.barge_elapsed_ms ?? null;
      const textHeard = msg.text_heard_approx ?? msg.metadata?.text_heard_approx ?? null;
      const textSpoken = msg.text_spoken_total ?? msg.metadata?.text_spoken_total ?? null;

      let bargeDetailHtml = '';
      if (msgBarged) {
        let bargeText = 'interrupted';
        if (bargeElapsed != null) bargeText += ` after ${(bargeElapsed / 1000).toFixed(1)}s`;
        if (textHeard && textSpoken && textSpoken.length > 0) {
          const pct = Math.round((textHeard.length / textSpoken.length) * 100);
          bargeText += ` (${pct}% heard)`;
        }
        metaTags.push({ text: `⏸ ${bargeText}`, class: 'barged' });

        // Build heard/unheard detail block
        if (textHeard && textSpoken) {
          const unheard = textSpoken.slice(textHeard.length).trim();
          bargeDetailHtml = `
            <div class="transcript__barge-detail">
              <span class="transcript__barge-heard">${escapeHtml(textHeard)}</span><span class="transcript__barge-cutoff"></span>${unheard ? `<span class="transcript__barge-unheard">${escapeHtml(unheard)}</span>` : ''}
            </div>`;
        }
      }

      // hearing_hint badge: show on user messages when a hint was applied just before
      if (role === 'user' && msg.timestamp && hintIdx < enrichedEvents.hearingHints.length) {
        const hint = enrichedEvents.hearingHints[hintIdx];
        if (hint.timestamp <= msg.timestamp) {
          metaTags.push({ text: `heard: ${hint.original} → ${hint.result}`, class: 'rewrite' });
          hintIdx++;
        }
      }

      // auto_correct badge: show on user messages when an auto-correct was applied
      if (role === 'user' && msg.timestamp && autoCorrectIdx < enrichedEvents.autoCorrects.length) {
        const ac = enrichedEvents.autoCorrects[autoCorrectIdx];
        if (ac.timestamp <= msg.timestamp) {
          metaTags.push({ text: `corrected: ${truncate(ac.original, 30)} → ${truncate(ac.corrected, 30)}`, class: 'rewrite' });
          autoCorrectIdx++;
        }
      }

      // text_normalize ITN badge: show on user messages
      if (role === 'user' && msg.timestamp && itnIdx < enrichedEvents.textNormalizeItn.length) {
        const itn = enrichedEvents.textNormalizeItn[itnIdx];
        if (itn.timestamp <= msg.timestamp) {
          metaTags.push({ text: `ITN: ${itn.original} → ${itn.normalized}`, class: 'rewrite' });
          itnIdx++;
        }
      }

      // Entry-level original field (ASR auto-correct on the message itself)
      if (role === 'user' && msg.original && msg.original !== msg.content) {
        metaTags.push({ text: `ASR: ${truncate(msg.original, 40)}`, class: 'rewrite' });
      }

      // Redacted badge
      if (showRedacted && msg.redacted) {
        metaTags.push({ text: 'redacted', class: 'redacted' });
      }

      // pronounce badge: pronounce rules / text normalization rewrote this
      // assistant message's TTS output (synthetic call_timeline event)
      if (role === 'assistant' && msg.timestamp && pronounceIdx < enrichedEvents.pronounceRules.length) {
        const rule = enrichedEvents.pronounceRules[pronounceIdx];
        if (rule.timestamp <= msg.timestamp) {
          metaTags.push({ text: `TTS: ${rule.original} → ${rule.result}`, class: 'rewrite' });
          pronounceIdx++;
        }
      }

      // Tool calls
      let toolCallsHtml = '';
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        toolCallsHtml = msg.tool_calls.map(tc => {
          const fn = tc.function;
          const toolText = `${fn.name}(${fn.arguments})`;
          const displayToolText = isSearching
            ? highlightMatches(toolText, search.query, search.caseSensitive)
            : escapeHtml(toolText);
          return `<div class="transcript__tool-calls">${displayToolText}</div>`;
        }).join('');
      }

      // Data attributes for filtering
      const dataAttrs = `
        data-role="${role}"
        data-has-barge="${!!msg.barge_count}"
        data-has-merge="${!!(msg.merge_count || msg.merged)}"
        data-has-tools="${!!(msg.tool_calls && msg.tool_calls.length > 0)}"
        data-is-garbage="${isGarbage}"
      `.trim();

      // Collect inline events that should appear before this message
      let inlineHtml = '';
      const msgTs = msg.timestamp || msg.start_timestamp || 0;
      while (inlineIdx < inlineEvents.length && inlineEvents[inlineIdx].timestamp <= msgTs) {
        const ev = inlineEvents[inlineIdx];
        if (ev._type === 'filler') {
          inlineHtml += `<div class="transcript__inline transcript__inline--filler"><span class="transcript__inline-text">${escapeHtml(ev.text)}</span></div>`;
        } else if (ev._type === 'manual_say') {
          inlineHtml += `
            <div class="transcript__msg transcript__msg--manual-say${ev.isError ? ' transcript__msg--manual-say-error' : ''}">
              <div class="transcript__role" style="color:#fb923c">say</div>
              <div class="transcript__body">
                <div class="transcript__content">${escapeHtml(ev.text)}</div>
                ${ev.isError ? `<div class="transcript__meta"><span class="transcript__meta-tag transcript__meta-tag--error">${escapeHtml(ev.errorReason || 'error')}</span></div>` : ''}
              </div>
            </div>`;
        } else if (ev._type === 'function_error') {
          inlineHtml += `
            <div class="transcript__inline transcript__inline--error">
              <span class="transcript__inline-error-label">Function Error</span>
              <code>${escapeHtml(ev.functionName)}</code>
              <span class="transcript__inline-error-detail">${escapeHtml(ev.errorType)}</span>
              ${ev.errorMessage ? `<span class="transcript__inline-error-msg">${escapeHtml(ev.errorMessage)}</span>` : ''}
            </div>`;
        } else if (ev._type === 'function_problem') {
          inlineHtml += `
            <div class="transcript__inline transcript__inline--error">
              <span class="transcript__inline-error-label">${escapeHtml(ev.label)}</span>
              <code>${escapeHtml(ev.functionName)}</code>
              <span class="transcript__inline-error-detail">${escapeHtml(ev.detail)}</span>
            </div>`;
        } else if (ev._type === 'inner_dialog') {
          const dialogId = `inner-dialog-${idx}-${inlineIdx}`;
          inlineHtml += `
            <div class="transcript__inline transcript__inline--inner-dialog">
              <button class="transcript__inner-dialog-toggle" data-target="${dialogId}">
                <span class="transcript__inner-dialog-label">${escapeHtml(ev.label || 'Inner Dialog')}</span>
                <span class="transcript__inner-dialog-chevron">&#9654;</span>
              </button>
              <div class="transcript__inner-dialog-body" id="${dialogId}" style="display:none">
                ${formatInnerDialog(ev.content)}
              </div>
            </div>`;
        }
        inlineIdx++;
      }

      // assistant-thinking: LLM reasoning output (no metadata, never in
      // call_timeline) — render collapsed so it doesn't drown the transcript
      if (role === 'assistant-thinking') {
        return `${inlineHtml}
        <div class="transcript__msg transcript__msg--${roleClass}" ${dataAttrs}>
          <div class="transcript__role">thinking</div>
          <div class="transcript__body">
            <details class="transcript__thinking">
              <summary>${escapeHtml(truncate(contentDisplay, 100))}</summary>
              <div class="transcript__content">${displayContent}</div>
            </details>
            ${time ? `<div class="transcript__meta"><span class="transcript__meta-tag">${time}</span></div>` : ''}
          </div>
        </div>
      `;
      }

      return `${inlineHtml}
        <div class="transcript__msg transcript__msg--${roleClass}" ${dataAttrs}>
          <div class="transcript__role">${role}</div>
          <div class="transcript__body">
            <div class="transcript__content${isGarbage ? ' transcript__content--garbage' : ''}${msgBarged ? ' transcript__content--barged' : ''}" id="msg-content-${idx}">
              ${displayContent}
            </div>
            ${bargeDetailHtml}
            ${toolCallsHtml}
            ${metaTags.length > 0 ? `
              <div class="transcript__meta">
                ${metaTags.map(t => {
                  if (typeof t === 'object') {
                    const style = t.color ? `style="color: ${t.color}; font-weight: 600;"` : '';
                    return `<span class="transcript__meta-tag transcript__meta-tag--${t.class}" ${style}>${t.text}</span>`;
                  }
                  return `<span class="transcript__meta-tag">${t}</span>`;
                }).join('')}
                ${time ? `<span class="transcript__meta-tag">${time}</span>` : ''}
              </div>
            ` : (time ? `<div class="transcript__meta"><span class="transcript__meta-tag">${time}</span></div>` : '')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSearchBar(messages) {
    const { search, filters } = getState();
    const activeFilters = filters.transcript;
    const isSearching = search.query && search.activeTab === 'transcript';

    // Count total matches across all messages
    let totalMatches = 0;
    if (isSearching) {
      messages.forEach(msg => {
        const content = msg.content || '';
        const toolCallsText = msg.tool_calls ? msg.tool_calls.map(tc => `${tc.function.name}(${tc.function.arguments})`).join(' ') : '';
        const searchableText = content + ' ' + toolCallsText;

        if (matchesSearch(searchableText, search.query, search.caseSensitive)) {
          // Count occurrences in this message
          const text = search.caseSensitive ? searchableText : searchableText.toLowerCase();
          const query = search.caseSensitive ? search.query : search.query.toLowerCase();
          let pos = 0;
          while ((pos = text.indexOf(query, pos)) !== -1) {
            totalMatches++;
            pos += query.length;
          }
        }
      });
    }

    const hasActiveFilters = activeFilters.roles.length > 0 ||
                           activeFilters.hasBarge ||
                           activeFilters.hasMerge ||
                           activeFilters.hasToolCalls ||
                           activeFilters.hasGarbage ||
                           activeFilters.hasInterrupted ||
                           activeFilters.responseTimeRating;

    return `
      <div class="search-filter-bar">
        <div class="search-filter-bar__filters">
          <button class="filter-chip filter-chip--role-user ${activeFilters.roles.includes('user') ? 'filter-chip--active' : ''}"
                  data-filter="role" data-value="user">
            User
          </button>
          <button class="filter-chip filter-chip--role-assistant ${activeFilters.roles.includes('assistant') ? 'filter-chip--active' : ''}"
                  data-filter="role" data-value="assistant">
            Assistant
          </button>
          <button class="filter-chip filter-chip--role-tool ${activeFilters.roles.includes('tool') ? 'filter-chip--active' : ''}"
                  data-filter="role" data-value="tool">
            Tool
          </button>
          <button class="filter-chip filter-chip--role-system ${activeFilters.roles.includes('system') ? 'filter-chip--active' : ''}"
                  data-filter="role" data-value="system">
            System
          </button>
          <button class="filter-chip filter-chip--barge ${activeFilters.hasBarge ? 'filter-chip--active' : ''}"
                  data-filter="barge">
            🔴 Barge-in
          </button>
          <button class="filter-chip filter-chip--merge ${activeFilters.hasMerge ? 'filter-chip--active' : ''}"
                  data-filter="merge">
            🔀 Merged
          </button>
          <button class="filter-chip filter-chip--tools ${activeFilters.hasToolCalls ? 'filter-chip--active' : ''}"
                  data-filter="tools">
            🔧 Tool Calls
          </button>
          <button class="filter-chip filter-chip--garbage ${activeFilters.hasGarbage ? 'filter-chip--active' : ''}"
                  data-filter="garbage">
            ⚠️ Garbage
          </button>
          <button class="filter-chip filter-chip--interrupted ${activeFilters.hasInterrupted ? 'filter-chip--active' : ''}"
                  data-filter="interrupted">
            ⏸ Interrupted
          </button>
          <select class="filter-dropdown" id="response-time-filter" aria-label="Filter by response time">
            <option value="">⏱️ Response Time</option>
            <option value="excellent" ${activeFilters.responseTimeRating === 'excellent' ? 'selected' : ''}>✓ Excellent (&lt;1.2s)</option>
            <option value="good" ${activeFilters.responseTimeRating === 'good' ? 'selected' : ''}>✓ Good (1.2-1.8s)</option>
            <option value="fair" ${activeFilters.responseTimeRating === 'fair' ? 'selected' : ''}>⚠ Fair (1.8-2.5s)</option>
            <option value="needs-improvement" ${activeFilters.responseTimeRating === 'needs-improvement' ? 'selected' : ''}>⚠ Slow (≥2.5s)</option>
          </select>
          ${hasActiveFilters || isSearching ? `
            <button class="filter-chip" data-filter="clear" style="margin-left: 0.5rem;">
              Clear all
            </button>
          ` : ''}
        </div>
        <div class="search-filter-bar__search">
          <div class="search-box">
            <input
              type="text"
              class="search-box__input"
              id="transcript-search-input"
              placeholder="Search transcript..."
              value="${search.activeTab === 'transcript' ? search.query : ''}"
              aria-label="Search transcript"
            />
            ${search.query && search.activeTab === 'transcript' ? `
              <button class="search-box__clear" id="clear-search" aria-label="Clear search">
                ✕
              </button>
            ` : ''}
          </div>
          ${isSearching && totalMatches > 0 ? `
            <div class="search-nav">
              <span class="search-nav__counter">${search.currentMatch + 1} of ${totalMatches}</span>
              <button class="search-nav__btn" id="search-prev" ${search.currentMatch === 0 ? 'disabled' : ''} aria-label="Previous match">
                ↑
              </button>
              <button class="search-nav__btn" id="search-next" ${search.currentMatch >= totalMatches - 1 ? 'disabled' : ''} aria-label="Next match">
                ↓
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function scrollToMatch(matchIndex) {
    const highlights = container.querySelectorAll('.search-highlight');

    // Remove current class from all
    highlights.forEach(h => h.classList.remove('current'));

    if (highlights[matchIndex]) {
      highlights[matchIndex].classList.add('current');
      const message = highlights[matchIndex].closest('.transcript__msg');
      if (message) {
        scrollToElement(message, 100);
      }
    }
  }

  function renderLog() {
    if (isRendering) return;
    isRendering = true;

    const allMessages = activeLog === 'processed' ? payload.callLog : (payload.rawCallLog || payload.callLog);
    const filteredMessages = applyFilters(allMessages);
    const hasRawLog = !!payload.rawCallLog;
    const { search, filters, showRedacted } = getState();

    // Store current state for comparison
    lastState = { search: { ...search }, filters: { ...filters }, showRedacted };

    const toggleStyle = 'padding:0.5rem 1rem;font-size:0.8rem;font-weight:500;cursor:pointer;border:none;background:none;color:var(--text-muted);border-bottom:2px solid transparent;transition:color 0.15s,border-color 0.15s';
    const activeStyle = 'padding:0.5rem 1rem;font-size:0.8rem;font-weight:500;cursor:pointer;border:none;background:none;color:var(--text-primary);border-bottom:2px solid var(--accent)';

    // Save focus state before innerHTML wipes the DOM
    const focusedId = document.activeElement?.id;
    const selStart = document.activeElement?.selectionStart ?? null;
    const selEnd = document.activeElement?.selectionEnd ?? null;

    container.innerHTML = `
      <div class="transcript">
        ${renderSearchBar(allMessages)}
        ${hasRawLog ? `
          <div style="display:flex;gap:0;margin-bottom:1rem;border-bottom:1px solid var(--border)">
            <button class="transcript__log-toggle" data-log="processed" style="${activeLog === 'processed' ? activeStyle : toggleStyle}">Processed Log</button>
            <button class="transcript__log-toggle" data-log="raw" style="${activeLog === 'raw' ? activeStyle : toggleStyle}">Raw Log</button>
          </div>
        ` : ''}
        ${filteredMessages.length > 0 ? buildMessagesHtml(filteredMessages) : `
          <div class="filter-empty">
            <div class="filter-empty__icon">🔍</div>
            <div class="filter-empty__title">No messages match current filters</div>
            <div class="filter-empty__message">Try adjusting your search or filters</div>
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

    // Toggle handlers for log switching
    container.querySelectorAll('.transcript__log-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLog = btn.dataset.log;
        renderLog();
      });
    });

    // Inner dialog toggle handlers
    container.querySelectorAll('.transcript__inner-dialog-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const body = container.querySelector(`#${targetId}`);
        const chevron = btn.querySelector('.transcript__inner-dialog-chevron');
        if (body) {
          const isOpen = body.style.display !== 'none';
          body.style.display = isOpen ? 'none' : 'block';
          if (chevron) chevron.innerHTML = isOpen ? '&#9654;' : '&#9660;';
        }
      });
    });

    // Filter chip handlers
    container.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        const filterType = chip.dataset.filter;
        const filterValue = chip.dataset.value;
        const { filters } = getState();
        const transcriptFilters = { ...filters.transcript };

        if (filterType === 'role') {
          const roleIndex = transcriptFilters.roles.indexOf(filterValue);
          if (roleIndex > -1) {
            transcriptFilters.roles = transcriptFilters.roles.filter(r => r !== filterValue);
          } else {
            transcriptFilters.roles = [...transcriptFilters.roles, filterValue];
          }
        } else if (filterType === 'barge') {
          transcriptFilters.hasBarge = !transcriptFilters.hasBarge;
        } else if (filterType === 'merge') {
          transcriptFilters.hasMerge = !transcriptFilters.hasMerge;
        } else if (filterType === 'tools') {
          transcriptFilters.hasToolCalls = !transcriptFilters.hasToolCalls;
        } else if (filterType === 'garbage') {
          transcriptFilters.hasGarbage = !transcriptFilters.hasGarbage;
        } else if (filterType === 'interrupted') {
          transcriptFilters.hasInterrupted = !transcriptFilters.hasInterrupted;
        } else if (filterType === 'clear') {
          transcriptFilters.roles = [];
          transcriptFilters.hasBarge = false;
          transcriptFilters.hasMerge = false;
          transcriptFilters.hasToolCalls = false;
          transcriptFilters.hasGarbage = false;
          transcriptFilters.hasInterrupted = false;
          transcriptFilters.responseTimeRating = '';

          // Also clear search
          update({
            filters: { ...filters, transcript: transcriptFilters },
            search: { query: '', caseSensitive: false, currentMatch: 0, totalMatches: 0, activeTab: null }
          });
          return;
        }

        update({
          filters: { ...filters, transcript: transcriptFilters }
        });
      });
    });

    // Response time filter dropdown
    const responseTimeFilter = container.querySelector('#response-time-filter');
    if (responseTimeFilter) {
      responseTimeFilter.addEventListener('change', (e) => {
        const { filters } = getState();
        const transcriptFilters = { ...filters.transcript };
        transcriptFilters.responseTimeRating = e.target.value;

        update({
          filters: { ...filters, transcript: transcriptFilters }
        });
      });
    }

    // Search input handler (debounced)
    const searchInput = container.querySelector('#transcript-search-input');
    if (searchInput) {
      const debouncedSearch = debounce((value) => {
        update({
          search: {
            ...getState().search,
            query: value,
            activeTab: value ? 'transcript' : null,
            currentMatch: 0
          }
        });
      }, 300);

      searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    }

    // Clear search button
    const clearBtn = container.querySelector('#clear-search');
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

    // Search navigation
    const prevBtn = container.querySelector('#search-prev');
    const nextBtn = container.querySelector('#search-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const { search } = getState();
        if (search.currentMatch > 0) {
          const newMatch = search.currentMatch - 1;
          update({
            search: { ...search, currentMatch: newMatch }
          });
          // Scroll will happen after re-render via state subscription
          setTimeout(() => scrollToMatch(newMatch), 50);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const highlights = container.querySelectorAll('.search-highlight');
        const { search } = getState();
        if (search.currentMatch < highlights.length - 1) {
          const newMatch = search.currentMatch + 1;
          update({
            search: { ...search, currentMatch: newMatch }
          });
          // Scroll will happen after re-render via state subscription
          setTimeout(() => scrollToMatch(newMatch), 50);
        }
      });
    }

    // Scroll to current match if searching
    if (search.query && search.activeTab === 'transcript') {
      setTimeout(() => scrollToMatch(search.currentMatch), 50);
    }

    // Keyboard shortcuts - clean up old handler first
    if (keyboardHandler) {
      document.removeEventListener('keydown', keyboardHandler);
    }

    keyboardHandler = (e) => {
      if (e.target.tagName === 'INPUT') return; // Don't interfere with input

      const { search } = getState();
      if (!search.query || search.activeTab !== 'transcript') return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        nextBtn?.click();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        prevBtn?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearBtn?.click();
      }
    };

    document.addEventListener('keydown', keyboardHandler);

    // Store cleanup function
    if (unsubscribe) {
      unsubscribe();
    }

    // Subscribe to state changes (only set up once)
    if (!unsubscribe) {
      unsubscribe = subscribe((state) => {
        // Only re-render if filters/search actually changed
        if (!lastState) return;

        const searchChanged = JSON.stringify(state.search) !== JSON.stringify(lastState.search);
        const filtersChanged = JSON.stringify(state.filters) !== JSON.stringify(lastState.filters);
        const redactedChanged = state.showRedacted !== lastState.showRedacted;

        if (searchChanged || filtersChanged || redactedChanged) {
          renderLog();
        }
      });
    }

    isRendering = false;
  }

  renderLog();
}
