import { formatDuration, formatMs, usToSec, truncate, fieldsOf, measuredMs } from '../../lib/utils.js';

const PHASE_COLORS = {
  ring: '#044EF4',
  setup: '#8b5cf6',
  ai: '#22c55e',
  teardown: '#FFD700',
};

const ROLE_BG = {
  user: 'rgba(34, 197, 94, 0.7)',
  assistant: 'rgba(4, 78, 244, 0.7)',
  'assistant-manual': 'rgba(64, 224, 208, 0.6)',
  tool: 'rgba(255, 215, 0, 0.7)',
  system: 'rgba(139, 92, 246, 0.6)',
};

const LABEL_WIDTH = 72;

/**
 * Classify a system-log message content into a category.
 * Returns null for entries we don't want on the swimlane.
 */
function classifySystemLog(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (trimmed.startsWith('Thinking:')) return 'assistant-thinking';
  // Skip "Calling function:" - redundant with TOOL row
  // if (trimmed.startsWith('Calling function:')) return 'calling';
  if (trimmed.startsWith('Steps function:')) return 'step';
  return null;
}

export function renderTimeline(container, payload, metrics) {
  const callStart = payload.callStartDate;
  const callEnd = payload.callEndDate || payload.aiEndDate;
  const callTotal = callEnd - callStart;

  if (callTotal <= 0) {
    container.innerHTML = '<div class="call-timeline"><p style="color:var(--text-muted)">Timeline data unavailable</p></div>';
    return;
  }

  const aiStart = payload.aiStartDate || callStart;
  const aiEnd = payload.aiEndDate || callEnd;
  const aiTotal = aiEnd - aiStart;

  // Swimlane spans from AI start through AI end.
  // Per spec: use ai_start_date as anchor, not call_answer_date.
  const swimStart = aiStart;
  const swimEnd = aiEnd;
  const swimTotal = swimEnd - swimStart;

  // ─── Macro phases ───
  const phases = [];
  if (payload.callAnswerDate && payload.callAnswerDate > callStart) {
    phases.push({ label: 'Ring', color: PHASE_COLORS.ring, startUs: callStart, endUs: payload.callAnswerDate });
  }
  if (payload.aiStartDate) {
    const from = payload.callAnswerDate || callStart;
    if (payload.aiStartDate > from) {
      phases.push({ label: 'Setup', color: PHASE_COLORS.setup, startUs: from, endUs: payload.aiStartDate });
    }
  }
  if (payload.aiStartDate && payload.aiEndDate) {
    phases.push({ label: 'AI Session', color: PHASE_COLORS.ai, startUs: payload.aiStartDate, endUs: payload.aiEndDate });
  }
  if (payload.aiEndDate && callEnd > payload.aiEndDate) {
    phases.push({ label: 'Teardown', color: PHASE_COLORS.teardown, startUs: payload.aiEndDate, endUs: callEnd });
  }

  // ─── Tool request lookup: tool_call_id → the assistant's tool_calls entry ───
  // Identity comes from the tool entry's own function_name; the request map
  // supplies the arguments (and a name fallback for pre-enriched payloads).
  const toolCallById = new Map();
  for (const msg of payload.callLog) {
    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const fn = tc.function || {};
        if (tc.id) toolCallById.set(tc.id, { name: fn.name || 'unknown', arguments: fn.arguments || '{}' });
      }
    }
  }

  // ─── Collect enriched events for new swimlane rows ───
  // Use call_timeline as primary source when available, fall back to call_log
  const enrichedSource = payload.callTimeline
    ? payload.callTimeline.map(e => ({ role: 'system-log', action: e.type, timestamp: e.ts, metadata: e }))
    : payload.callLog;
  const enrichedRows = [];
  for (const msg of enrichedSource) {
    if (msg.role !== 'system-log' || !msg.action || !msg.timestamp) continue;
    const m = fieldsOf(msg);

    if (msg.action === 'filler') {
      enrichedRows.push({
        role: 'enriched',
        category: 'filler',
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp + 1_500_000, // ~1.5s
        durationMs: 1500,
        label: truncate(m.text || 'thinking...', 20),
        content: m.text || 'Thinking filler',
      });
    } else if (msg.action === 'attention_timeout') {
      enrichedRows.push({
        role: 'enriched',
        category: 'attention-timeout',
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp + 500_000, // ~0.5s marker
        durationMs: Math.round((m.timeout_ms || m.timeout || 500)),
        label: 'Timeout',
        content: `Inactivity timeout (${m.timeout_ms || m.timeout || '?'}ms)`,
      });
    } else if (msg.action === 'manual_say') {
      enrichedRows.push({
        role: 'enriched',
        category: 'manual-say',
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp + 3_000_000, // ~3s estimate
        durationMs: 3000,
        label: truncate(m.text || 'say', 20),
        content: (m.text || 'System say') + (m.is_error ? ' [ERROR]' : ''),
      });
    } else if (msg.action === 'hearing_hint' || msg.action === 'pronounce' ||
               msg.action === 'text_normalize' || msg.action === 'auto_correct') {
      // hearing_hint / auto_correct are system-log actions; pronounce and
      // text_normalize are synthetic call_timeline events.
      const rewritten = m.result ?? m.normalized ?? m.corrected ?? '';
      const labels = { hearing_hint: 'ASR hint', pronounce: 'TTS rule', text_normalize: 'ITN', auto_correct: 'Auto-correct' };
      enrichedRows.push({
        role: 'enriched',
        category: 'rewrite',
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp + 200_000, // thin marker
        durationMs: 200,
        label: labels[msg.action],
        content: `${m.original || ''} → ${rewritten}`,
      });
    } else if (msg.action === 'context_enter') {
      enrichedRows.push({
        role: 'enriched',
        category: 'context-switch',
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp + 300_000,
        durationMs: 300,
        label: truncate(m.to_context || 'context', 20),
        content: `Context: ${m.from_context || '?'} → ${m.to_context || '?'}${m.isolated ? ' (isolated)' : ''}`,
      });
    } else if (msg.action === 'reset') {
      const kind = m.full_reset ? 'full reset' : (m.consolidate ? 'consolidate' : 'reset');
      enrichedRows.push({
        role: 'enriched',
        category: 'reset',
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp + 300_000,
        durationMs: 300,
        label: kind,
        content: `Reset: ${kind}`,
      });
    }
  }

  // ─── Collect ALL events including system-log ───
  const allMessages = [];
  for (const msg of payload.callLog) {
    if (!msg.timestamp && !msg.start_timestamp) continue;
    allMessages.push(msg);
  }
  allMessages.sort((a, b) => (a.start_timestamp || a.timestamp) - (b.start_timestamp || b.timestamp));

  // Build typed events from sorted messages
  const events = [];
  for (let mi = 0; mi < allMessages.length; mi++) {
    const msg = allMessages[mi];

    // Skip initial system prompt and goal updates (verbose, not actionable)
    if (msg.role === 'system') continue;

    // assistant-thinking: reasoning output logged as its own role (no
    // metadata, no start/end window) — span it until the next message.
    if (msg.role === 'assistant-thinking') {
      let nextTs = swimEnd;
      for (let j = mi + 1; j < allMessages.length; j++) {
        nextTs = allMessages[j].start_timestamp || allMessages[j].timestamp;
        break;
      }
      const durationMs = Math.round((nextTs - msg.timestamp) / 1000);
      if (durationMs < 20) continue;
      const content = typeof msg.content === 'string' ? msg.content.trim() : '';
      events.push({
        role: 'system',
        category: 'assistant-thinking',
        timestamp: msg.timestamp,
        endTimestamp: nextTs,
        durationMs,
        content,
        label: truncate(content, 40),
      });
      continue;
    }

    // System-log: only include classified entries
    if (msg.role === 'system-log') {
      const category = classifySystemLog(msg.content);
      if (!category) continue;

      // Find the next message to determine this entry's duration
      let nextTs = swimEnd;
      for (let j = mi + 1; j < allMessages.length; j++) {
        nextTs = allMessages[j].timestamp;
        break;
      }
      let durationMs = Math.round((nextTs - msg.timestamp) / 1000);
      // Skip very short entries (< 20ms) — they're just log markers
      if (durationMs < 20) continue;

      const content = typeof msg.content === 'string' ? msg.content.trim() : '';
      let label = '';
      if (category === 'assistant-thinking') {
        label = content.replace(/^Thinking:\s*/, '');
        label = truncate(label, 40);
      } else if (category === 'calling') {
        label = content.replace(/^Calling function:\s*/, '');
        label = truncate(label, 40);
      } else if (category === 'step') {
        label = content.replace(/^Steps function:\s*/, '');
        label = truncate(label, 40);
      }

      events.push({
        role: 'system',
        category,
        timestamp: msg.timestamp,
        endTimestamp: nextTs,
        durationMs,
        content,
        label,
      });
      continue;
    }

    // Skip assistant tool dispatches (no content, just function calls)
    if (msg.role === 'assistant' && msg.tool_calls && !msg.content) continue;
    // Skip assistant messages without exact timestamps (summary, etc.)
    if (msg.role === 'assistant' && !msg.start_timestamp) continue;

    const ev = {
      role: msg.role,
      startTimestamp: msg.start_timestamp || 0,
      endTimestamp: msg.end_timestamp || 0,
      content: typeof msg.content === 'string' ? msg.content.trim() : '',
      // null / 0 = not measured, never charted as real values
      audioLatency: measuredMs(msg.audio_latency) ?? measuredMs(msg.utterance_latency) ?? measuredMs(msg.latency) ?? 0,
      acousticLatency: measuredMs(msg.acoustic_latency),
      eosToPushLatency: measuredMs(msg.eos_to_push_latency),
      pollLatency: measuredMs(msg.poll),
      timingsInferred: !!msg.timings_inferred,
    };

    // Barge-in data (assistant was interrupted by caller)
    if (msg.role === 'assistant') {
      const barged = msg.barged ?? msg.metadata?.barged ?? false;
      if (barged) {
        ev.barged = true;
        ev.bargeElapsedMs = msg.barge_elapsed_ms ?? msg.metadata?.barge_elapsed_ms ?? null;
        const heard = msg.text_heard_approx ?? msg.metadata?.text_heard_approx ?? null;
        const spoken = msg.text_spoken_total ?? msg.metadata?.text_spoken_total ?? null;
        ev.bargeHeardPct = (heard && spoken && spoken.length > 0)
          ? Math.round((heard.length / spoken.length) * 100) : null;
      }
    }

    if (msg.role === 'user') {
      ev.speakingToTurn = msg.speaking_to_turn_detection || 0;
      ev.turnToFinal = msg.turn_detection_to_final_event || 0;
      ev.confidence = msg.confidence || 0;
    }

    if (msg.role === 'tool') {
      const request = toolCallById.get(msg.tool_call_id || msg.id) || {};
      // function_name on the tool entry is the direct-identity field;
      // the tool_call_id-correlated request is the fallback + args source.
      ev.toolName = msg.function_name || request.name || 'unknown';
      ev.toolArgs = request.arguments || '{}';
      // Real execution time (end − start µs); the execution_latency /
      // function_latency fields are deprecated aliases of the surrounding
      // LLM turn's audio/utterance latency, not the tool's own timing.
      ev.executionMs = (msg.start_timestamp && msg.end_timestamp)
        ? Math.round((msg.end_timestamp - msg.start_timestamp) / 1000) : 0;
      ev.turnAudioLatency = measuredMs(msg.execution_latency) ?? 0;
      ev.distilled = !!msg.distilled;
    }

    events.push(ev);
  }

  // ─── Build segments ───
  // Separate system events from conversation events for different handling
  const convEvents = events.filter(e => e.role !== 'system');
  const sysEvents = events.filter(e => e.role === 'system');

  const segments = [];

  // System segments (simple: start→end already computed)
  for (const ev of sysEvents) {
    const startUs = Math.max(ev.timestamp, swimStart);
    const endUs = Math.min(ev.endTimestamp, swimEnd);
    segments.push({
      role: 'system',
      category: ev.category,
      startUs,
      endUs,
      durationMs: ev.durationMs,
      label: ev.label,
      content: ev.content,
    });
  }

  // Conversation segments (user, assistant, tool)
  for (let i = 0; i < convEvents.length; i++) {
    const ev = convEvents[i];
    let startUs, endUs, durationMs;

    if (ev.role === 'user') {
      if (!ev.startTimestamp || !ev.endTimestamp) continue;
      startUs = ev.startTimestamp;
      endUs = ev.endTimestamp;
      durationMs = (endUs - startUs) / 1000;
    } else if (ev.role === 'assistant') {
      if (!ev.startTimestamp || !ev.endTimestamp) continue;
      startUs = ev.startTimestamp;
      endUs = Math.min(ev.endTimestamp, swimEnd);
      durationMs = (endUs - startUs) / 1000;
    } else if (ev.role === 'assistant-manual') {
      if (!ev.startTimestamp || !ev.endTimestamp) continue;
      startUs = ev.startTimestamp;
      endUs = ev.endTimestamp;
      durationMs = (endUs - startUs) / 1000;
    } else if (ev.role === 'tool') {
      if (!ev.startTimestamp || !ev.endTimestamp) continue;
      startUs = ev.startTimestamp;
      endUs = ev.endTimestamp;
      durationMs = (endUs - startUs) / 1000;
    }

    const seg = {
      role: ev.role,
      startUs: Math.max(startUs, swimStart),
      endUs: Math.min(endUs, swimEnd),
      durationMs: Math.round(durationMs),
      label: ev.role === 'tool' ? (ev.toolName || 'Tool') : (truncate(ev.content, 30) || ev.role),
      content: ev.content,
    };

    if (ev.role === 'tool') {
      seg.toolName = ev.toolName;
      seg.toolArgs = ev.toolArgs;
      seg.executionMs = ev.executionMs;
      seg.turnAudioLatency = ev.turnAudioLatency;
      seg.distilled = ev.distilled;
    }

    if (ev.role === 'assistant' || ev.role === 'assistant-manual') {
      seg.acousticLatency = ev.acousticLatency;
      seg.eosToPushLatency = ev.eosToPushLatency;
      seg.pollLatency = ev.pollLatency;
    }

    if (ev.role === 'user') {
      seg.speakingToTurn = ev.speakingToTurn;
      seg.turnToFinal = ev.turnToFinal;
      seg.confidence = ev.confidence;
    }

    if (ev.barged) {
      seg.barged = true;
      seg.bargeElapsedMs = ev.bargeElapsedMs;
      seg.bargeHeardPct = ev.bargeHeardPct;
    }

    segments.push(seg);
  }

  // Enriched event segments
  for (const ev of enrichedRows) {
    const startUs = Math.max(ev.timestamp, swimStart);
    const endUs = Math.min(ev.endTimestamp, swimEnd);
    if (startUs >= endUs) continue;
    segments.push({
      role: 'enriched',
      category: ev.category,
      startUs,
      endUs,
      durationMs: ev.durationMs,
      label: ev.label,
      content: ev.content,
    });
  }

  // Compute gaps (sorted by start across all segments)
  const sorted = [...segments].sort((a, b) => a.startUs - b.startUs);
  const gapMap = new Map();
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      gapMap.set(sorted[i], Math.round((sorted[i].startUs - swimStart) / 1000));
    } else {
      gapMap.set(sorted[i], Math.round(Math.max(0, (sorted[i].startUs - sorted[i - 1].endUs) / 1000)));
    }
  }

  // ─── Rendering helpers ───
  const callPct = (us) => ((us - callStart) / callTotal) * 100;
  const swimPct = (us) => ((us - swimStart) / swimTotal) * 100;

  const SYSTEM_COLORS = {
    'assistant-thinking': 'rgba(139, 92, 246, 0.6)',
    calling: 'rgba(245, 158, 11, 0.5)',
    step: 'rgba(148, 163, 184, 0.5)',
  };

  const ENRICHED_COLORS = {
    filler: 'rgba(253, 230, 138, 0.6)',
    'attention-timeout': 'rgba(239, 68, 68, 0.7)',
    'manual-say': 'rgba(251, 146, 60, 0.6)',
    rewrite: 'rgba(168, 85, 247, 0.4)',
    'context-switch': 'rgba(2, 132, 199, 0.6)',
    reset: 'rgba(220, 38, 38, 0.6)',
  };

  function renderSegments(role) {
    return segments.filter(s => s.role === role || (role === 'say' && s.role === 'assistant-manual') || (role === 'enriched' && s.role === 'enriched')).map(seg => {
      const left = swimPct(seg.startUs);
      const width = Math.max(swimPct(seg.endUs) - left, 0.3);
      const gap = gapMap.get(seg) || 0;
      const showLabel = width > 4;

      const bg = seg.role === 'assistant-manual'
        ? ROLE_BG['assistant-manual']
        : seg.role === 'enriched'
          ? (ENRICHED_COLORS[seg.category] || 'rgba(148, 163, 184, 0.5)')
          : role === 'system'
            ? (SYSTEM_COLORS[seg.category] || ROLE_BG.system)
            : ROLE_BG[seg.role];

      let attrs = `data-role="${seg.role}" data-duration="${seg.durationMs}" data-gap="${gap}" data-content="${(seg.content || seg.label).replace(/"/g, '&quot;')}" data-start="${Math.round((seg.startUs - swimStart) / 1000)}"`;

      if (seg.category) attrs += ` data-category="${seg.category}"`;

      if (seg.role === 'tool') {
        attrs += ` data-tool-name="${(seg.toolName || '').replace(/"/g, '&quot;')}"`;
        attrs += ` data-tool-args="${(seg.toolArgs || '').replace(/"/g, '&quot;')}"`;
        attrs += ` data-exec-ms="${seg.executionMs || 0}"`;
        attrs += ` data-turn-audio-latency="${seg.turnAudioLatency || 0}"`;
        if (seg.distilled) attrs += ` data-distilled="true"`;
      }

      if (seg.role === 'assistant' || seg.role === 'assistant-manual') {
        if (seg.acousticLatency != null) attrs += ` data-acoustic="${seg.acousticLatency}"`;
        if (seg.eosToPushLatency != null) attrs += ` data-eos-to-push="${seg.eosToPushLatency}"`;
        if (seg.pollLatency != null) attrs += ` data-poll="${seg.pollLatency}"`;
      }

      if (seg.role === 'user') {
        attrs += ` data-speaking-to-turn="${seg.speakingToTurn || 0}"`;
        attrs += ` data-turn-to-final="${seg.turnToFinal || 0}"`;
        attrs += ` data-confidence="${seg.confidence || 0}"`;
      }

      if (seg.barged) {
        attrs += ` data-barged="true"`;
        attrs += ` data-barge-elapsed="${seg.bargeElapsedMs || 0}"`;
        if (seg.bargeHeardPct != null) attrs += ` data-barge-heard-pct="${seg.bargeHeardPct}"`;
      }

      return `<div class="swimlane__segment" style="left:${left}%;width:${width}%;background:${bg}" ${attrs}>${showLabel ? `<span class="swimlane__label">${seg.label}</span>` : ''}</div>`;
    }).join('');
  }

  // ─── Macro bar ───
  const macroHtml = phases.map(p => {
    const left = callPct(p.startUs);
    const width = callPct(p.endUs) - left;
    const durSec = usToSec(p.endUs - p.startUs);
    return `<div class="call-timeline__phase" style="left:${left}%;width:${width}%;background:${p.color}" title="${p.label}: ${formatDuration(durSec)}">${width > 10 ? p.label : ''}</div>`;
  }).join('');

  const macroLegend = phases.map(p => {
    const durSec = usToSec(p.endUs - p.startUs);
    return `<div class="call-timeline__legend"><span class="call-timeline__legend-dot" style="background:${p.color}"></span>${p.label}: ${formatDuration(durSec)}</div>`;
  }).join('');

  const hasTools = segments.some(s => s.role === 'tool');
  const hasSystem = segments.some(s => s.role === 'system');
  const hasSay = segments.some(s => s.role === 'assistant-manual');
  const hasEnriched = segments.some(s => s.role === 'enriched');

  const roles = ['user', 'assistant', ...(hasTools ? ['tool'] : []), ...(hasSay ? ['say'] : []), ...(hasSystem ? ['system'] : []), ...(hasEnriched ? ['enriched'] : [])];
  const roleLabels = { user: 'User', assistant: 'Assistant', tool: 'Tool', say: 'Say', system: 'System', enriched: 'Events' };

  const roleLegendItems = [];
  for (const role of roles) {
    const count = segments.filter(s => s.role === role || (role === 'say' && s.role === 'assistant-manual')).length;
    const bg = role === 'say' ? ROLE_BG['assistant-manual'] : role === 'system' ? ROLE_BG.system : ROLE_BG[role];
    roleLegendItems.push(`<div class="call-timeline__legend"><span class="call-timeline__legend-dot" style="background:${bg}"></span>${roleLabels[role]} (${count})</div>`);
  }
  if (hasSystem) {
    const hasThinking = segments.some(s => s.role === 'system' && s.category === 'assistant-thinking');
    const hasStep = segments.some(s => s.role === 'system' && s.category === 'step');

    if (hasThinking) {
      roleLegendItems.push(`<div class="call-timeline__legend"><span class="call-timeline__legend-dot" style="background:${SYSTEM_COLORS['assistant-thinking']}"></span>Thinking</div>`);
    }
    if (hasStep) {
      roleLegendItems.push(`<div class="call-timeline__legend"><span class="call-timeline__legend-dot" style="background:${SYSTEM_COLORS.step}"></span>Step</div>`);
    }
  }
  if (hasEnriched) {
    const enrichedCategories = new Set(segments.filter(s => s.role === 'enriched').map(s => s.category));
    const categoryLabels = { filler: 'Filler', 'attention-timeout': 'Timeout', 'manual-say': 'System Say', rewrite: 'Rewrite', 'context-switch': 'Context', reset: 'Reset' };
    for (const cat of enrichedCategories) {
      roleLegendItems.push(`<div class="call-timeline__legend"><span class="call-timeline__legend-dot" style="background:${ENRICHED_COLORS[cat] || 'rgba(148,163,184,0.5)'}"></span>${categoryLabels[cat] || cat}</div>`);
    }
  }
  const roleLegend = roleLegendItems.join('');

  const aiMarkerHtml = '';

  const swimlaneRows = roles.map(role => `
    <div class="swimlane__row">
      <div class="swimlane__row-label" style="width:${LABEL_WIDTH}px">${roleLabels[role]}</div>
      <div class="swimlane__track">${renderSegments(role)}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="call-timeline">
      <div class="call-timeline__bar">
        <div class="call-timeline__title">Call Phases</div>
        <div class="swimlane__row">
          <div class="swimlane__row-label" style="width:${LABEL_WIDTH}px">Phases</div>
          <div class="swimlane__track timeline__track--macro">${macroHtml}</div>
        </div>
        <div class="call-timeline__legends" style="padding-left:${LABEL_WIDTH + 12}px">${macroLegend}</div>
      </div>
      <div class="call-timeline__bar" style="margin-top:1rem">
        <div class="call-timeline__title">Conversation Flow <span style="font-weight:400;color:var(--text-muted);font-size:0.75rem">(from Answer)</span></div>
        <div class="swimlane" id="swimlane" style="position:relative">
          ${aiMarkerHtml}
          ${swimlaneRows}
        </div>
        <div class="call-timeline__legends" style="padding-left:${LABEL_WIDTH + 12}px">${roleLegend}</div>
      </div>
      <div class="swimlane__tooltip" id="swimlane-tooltip"></div>
    </div>
  `;

  // ─── Custom tooltip ───
  const tooltip = container.querySelector('#swimlane-tooltip');
  const swimlane = container.querySelector('#swimlane');
  if (!swimlane || !tooltip) return;

  swimlane.addEventListener('mouseover', (e) => {
    const seg = e.target.closest('.swimlane__segment');
    if (!seg) { tooltip.style.display = 'none'; return; }

    const role = seg.dataset.role;
    const duration = parseInt(seg.dataset.duration);
    const gap = parseInt(seg.dataset.gap);
    const content = seg.dataset.content;
    const startMs = parseInt(seg.dataset.start);
    const category = seg.dataset.category || '';

    let html = '';

    if (role === 'tool') {
      const toolName = seg.dataset.toolName || 'unknown';
      const toolArgs = seg.dataset.toolArgs || '{}';
      const execMs = parseInt(seg.dataset.execMs) || 0;
      const turnAudioLat = parseInt(seg.dataset.turnAudioLatency) || 0;

      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--tool">${toolName}</div>`;

      try {
        const parsed = JSON.parse(toolArgs);
        const formatted = JSON.stringify(parsed, null, 2);
        html += `<div class="swimlane__tooltip-section">Arguments</div>`;
        html += `<pre class="swimlane__tooltip-json">${formatted}</pre>`;
      } catch {
        html += `<div class="swimlane__tooltip-section">Arguments</div>`;
        html += `<pre class="swimlane__tooltip-json">${toolArgs}</pre>`;
      }

      if (content) {
        const cleaned = content.replace(/^Function result Below\. Use this information to answer the query, remain in the same language\.\n?/i, '');
        html += `<div class="swimlane__tooltip-section">Response</div>`;
        html += `<div class="swimlane__tooltip-response">${cleaned}</div>`;
      }

      html += `<div class="swimlane__tooltip-divider"></div>`;
      if (execMs > 0) html += `<div class="swimlane__tooltip-row"><span>Execution</span><strong>${formatMs(execMs)}</strong></div>`;
      if (turnAudioLat > 0) {
        html += `<div class="swimlane__tooltip-row"><span>Turn audio latency</span><span>${formatMs(turnAudioLat)}</span></div>`;
      }
      if (seg.dataset.distilled) html += `<div class="swimlane__tooltip-row"><span>Result</span><span>distilled</span></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;
      if (gap > 0) {
        html += `<div class="swimlane__tooltip-row swimlane__tooltip-row--gap"><span>Gap from prev</span><strong>${formatMs(gap)}</strong></div>`;
      }

    } else if (role === 'assistant-manual') {
      const displayText = content;
      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--system">Manual Say</div>`;
      html += `<div class="swimlane__tooltip-text">${displayText}</div>`;
      html += `<div class="swimlane__tooltip-row"><span>Duration</span><strong>${formatMs(duration)}</strong></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;
      if (gap > 0) {
        html += `<div class="swimlane__tooltip-row swimlane__tooltip-row--gap"><span>Gap from prev</span><strong>${formatMs(gap)}</strong></div>`;
      }

    } else if (role === 'enriched') {
      const catLabel = { filler: 'Filler', 'attention-timeout': 'Attention Timeout', 'manual-say': 'System Say', rewrite: 'Text Rewrite', 'context-switch': 'Context Switch', reset: 'Reset' }[category] || 'Event';
      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--system">${catLabel}</div>`;
      if (content) html += `<div class="swimlane__tooltip-text">${content}</div>`;
      html += `<div class="swimlane__tooltip-row"><span>Duration</span><strong>${formatMs(duration)}</strong></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;

    } else if (role === 'system') {
      const catLabel = category === 'assistant-thinking' ? 'Thinking'
        : category === 'calling' ? 'Function Dispatch'
        : category === 'step' ? 'Step Transition'
        : 'System';
      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--system">${catLabel}</div>`;
      // Show full content without the prefix
      let displayText = content;
      if (category === 'assistant-thinking') displayText = content.replace(/^Thinking:\s*/, '');
      else if (category === 'calling') displayText = content.replace(/^Calling function:\s*/, '');
      else if (category === 'step') displayText = content.replace(/^Steps function:\s*/, '');
      html += `<div class="swimlane__tooltip-text">${displayText}</div>`;
      html += `<div class="swimlane__tooltip-row"><span>Duration</span><strong>${formatMs(duration)}</strong></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;
      if (gap > 0) {
        html += `<div class="swimlane__tooltip-row swimlane__tooltip-row--gap"><span>Gap from prev</span><strong>${formatMs(gap)}</strong></div>`;
      }

    } else if (role === 'user') {
      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--user">User</div>`;
      if (content) html += `<div class="swimlane__tooltip-text">${content}</div>`;
      const conf = parseFloat(seg.dataset.confidence) || 0;
      if (conf > 0) html += `<div class="swimlane__tooltip-row"><span>ASR Confidence</span><strong>${(conf * 100).toFixed(1)}%</strong></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Total Speech</span><strong>${formatMs(duration)}</strong></div>`;
      const s2t = parseInt(seg.dataset.speakingToTurn) || 0;
      const t2f = parseInt(seg.dataset.turnToFinal) || 0;
      if (s2t > 0) html += `<div class="swimlane__tooltip-row"><span>Speaking → Turn Detect</span><span>${formatMs(s2t)}</span></div>`;
      if (t2f > 0) html += `<div class="swimlane__tooltip-row"><span>Turn Detect → Final</span><span>${formatMs(t2f)}</span></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;
      if (gap > 0) {
        html += `<div class="swimlane__tooltip-row swimlane__tooltip-row--gap"><span>Gap from prev</span><strong>${formatMs(gap)}</strong></div>`;
      }

    } else if (role === 'assistant') {
      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--assistant">Assistant</div>`;
      if (content) html += `<div class="swimlane__tooltip-text">${content}</div>`;
      html += `<div class="swimlane__tooltip-row"><span>Duration</span><strong>${formatMs(duration)}</strong></div>`;
      const acoustic = parseInt(seg.dataset.acoustic);
      const eosToPush = parseInt(seg.dataset.eosToPush);
      const pollMs = parseInt(seg.dataset.poll);
      if (!isNaN(acoustic)) html += `<div class="swimlane__tooltip-row"><span>Perceived (acoustic)</span><strong>${formatMs(acoustic)}</strong></div>`;
      if (!isNaN(eosToPush)) html += `<div class="swimlane__tooltip-row"><span>Turn detection</span><span>${formatMs(eosToPush)}</span></div>`;
      if (!isNaN(pollMs)) html += `<div class="swimlane__tooltip-row"><span>Poll</span><span>${formatMs(pollMs)}</span></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;
      if (gap > 0) {
        html += `<div class="swimlane__tooltip-row swimlane__tooltip-row--gap"><span>Gap from prev</span><strong>${formatMs(gap)}</strong></div>`;
      }
      // Barge-in info
      if (seg.dataset.barged === 'true') {
        const bargeMs = parseInt(seg.dataset.bargeElapsed) || 0;
        const heardPct = seg.dataset.bargeHeardPct;
        html += `<div class="swimlane__tooltip-divider"></div>`;
        html += `<div class="swimlane__tooltip-row" style="color:#ef4444"><span>Interrupted after</span><strong>${formatMs(bargeMs)}</strong></div>`;
        if (heardPct) {
          html += `<div class="swimlane__tooltip-row" style="color:#ef4444"><span>Response heard</span><strong>${heardPct}%</strong></div>`;
        }
      }
    } else {
      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
      html += `<div class="swimlane__tooltip-role swimlane__tooltip-role--${role}">${roleLabel}</div>`;
      if (content) html += `<div class="swimlane__tooltip-text">${content}</div>`;
      html += `<div class="swimlane__tooltip-row"><span>Duration</span><strong>${formatMs(duration)}</strong></div>`;
      html += `<div class="swimlane__tooltip-row"><span>Offset</span><span>${formatMs(startMs)}</span></div>`;
      if (gap > 0) {
        html += `<div class="swimlane__tooltip-row swimlane__tooltip-row--gap"><span>Gap from prev</span><strong>${formatMs(gap)}</strong></div>`;
      }
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
  });

  swimlane.addEventListener('mousemove', (e) => {
    if (tooltip.style.display !== 'block') return;
    const rect = container.getBoundingClientRect();
    let x = e.clientX - rect.left + 12;
    let y = e.clientY - rect.top - 10;
    if (x + 280 > rect.width) x = e.clientX - rect.left - 290;
    if (y < 0) y = 4;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });

  swimlane.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}
