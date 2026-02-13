import { formatDuration, formatMs, usToSec, truncate } from '../../lib/utils.js';

const PHASE_COLORS = {
  ring: '#3b82f6',
  setup: '#8b5cf6',
  ai: '#10b981',
  teardown: '#f59e0b',
};

const ROLE_BG = {
  user: 'rgba(16, 185, 129, 0.7)',
  assistant: 'rgba(59, 130, 246, 0.7)',
  'assistant-manual': 'rgba(6, 182, 212, 0.6)',
  tool: 'rgba(245, 158, 11, 0.7)',
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
  if (trimmed.startsWith('Calling function:')) return 'calling';
  if (trimmed.startsWith('Steps function:')) return 'step';
  return null;
}

export function renderTimeline(container, payload, metrics) {
  const callStart = payload.callStartDate;
  const callEnd = payload.callEndDate || payload.aiEndDate;
  const callTotal = callEnd - callStart;

  if (callTotal <= 0) {
    container.innerHTML = '<div class="timeline"><p style="color:var(--text-muted)">Timeline data unavailable</p></div>';
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

  // ─── Build a queue of tool dispatch info ───
  const pendingToolCalls = [];
  for (const msg of payload.callLog) {
    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const fn = tc.function || {};
        pendingToolCalls.push({ name: fn.name || 'unknown', arguments: fn.arguments || '{}' });
      }
    }
  }
  let toolCallIdx = 0;

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
      audioLatency: msg.audio_latency || msg.utterance_latency || msg.latency || 0,
    };

    if (msg.role === 'user') {
      ev.speakingToTurn = msg.speaking_to_turn_detection || 0;
      ev.turnToFinal = msg.turn_detection_to_final_event || 0;
      ev.confidence = msg.confidence || 0;
    }

    if (msg.role === 'tool') {
      const dispatch = pendingToolCalls[toolCallIdx] || {};
      toolCallIdx++;
      ev.toolName = dispatch.name || 'unknown';
      ev.toolArgs = dispatch.arguments || '{}';
      ev.executionLatency = msg.execution_latency || 0;
      ev.functionLatency = msg.function_latency || 0;
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
      seg.executionLatency = ev.executionLatency;
      seg.functionLatency = ev.functionLatency;
    }

    if (ev.role === 'user') {
      seg.speakingToTurn = ev.speakingToTurn;
      seg.turnToFinal = ev.turnToFinal;
      seg.confidence = ev.confidence;
    }

    segments.push(seg);
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

  function renderSegments(role) {
    return segments.filter(s => s.role === role || (role === 'say' && s.role === 'assistant-manual')).map(seg => {
      const left = swimPct(seg.startUs);
      const width = Math.max(swimPct(seg.endUs) - left, 0.3);
      const gap = gapMap.get(seg) || 0;
      const showLabel = width > 4;

      const bg = seg.role === 'assistant-manual'
        ? ROLE_BG['assistant-manual']
        : role === 'system'
          ? (SYSTEM_COLORS[seg.category] || ROLE_BG.system)
          : ROLE_BG[seg.role];

      let attrs = `data-role="${seg.role}" data-duration="${seg.durationMs}" data-gap="${gap}" data-content="${(seg.content || seg.label).replace(/"/g, '&quot;')}" data-start="${Math.round((seg.startUs - swimStart) / 1000)}"`;

      if (seg.category) attrs += ` data-category="${seg.category}"`;

      if (seg.role === 'tool') {
        attrs += ` data-tool-name="${(seg.toolName || '').replace(/"/g, '&quot;')}"`;
        attrs += ` data-tool-args="${(seg.toolArgs || '').replace(/"/g, '&quot;')}"`;
        attrs += ` data-exec-latency="${seg.executionLatency || 0}"`;
        attrs += ` data-func-latency="${seg.functionLatency || 0}"`;
      }

      if (seg.role === 'user') {
        attrs += ` data-speaking-to-turn="${seg.speakingToTurn || 0}"`;
        attrs += ` data-turn-to-final="${seg.turnToFinal || 0}"`;
        attrs += ` data-confidence="${seg.confidence || 0}"`;
      }

      return `<div class="swimlane__segment" style="left:${left}%;width:${width}%;background:${bg}" ${attrs}>${showLabel ? `<span class="swimlane__label">${seg.label}</span>` : ''}</div>`;
    }).join('');
  }

  // ─── Macro bar ───
  const macroHtml = phases.map(p => {
    const left = callPct(p.startUs);
    const width = callPct(p.endUs) - left;
    const durSec = usToSec(p.endUs - p.startUs);
    return `<div class="timeline__phase" style="left:${left}%;width:${width}%;background:${p.color}" title="${p.label}: ${formatDuration(durSec)}">${width > 10 ? p.label : ''}</div>`;
  }).join('');

  const macroLegend = phases.map(p => {
    const durSec = usToSec(p.endUs - p.startUs);
    return `<div class="timeline__legend"><span class="timeline__legend-dot" style="background:${p.color}"></span>${p.label}: ${formatDuration(durSec)}</div>`;
  }).join('');

  const hasTools = segments.some(s => s.role === 'tool');
  const hasSystem = segments.some(s => s.role === 'system');
  const hasSay = segments.some(s => s.role === 'assistant-manual');

  const roles = ['user', 'assistant', ...(hasTools ? ['tool'] : []), ...(hasSay ? ['say'] : []), ...(hasSystem ? ['system'] : [])];
  const roleLabels = { user: 'User', assistant: 'Assistant', tool: 'Tool', say: 'Say', system: 'System' };

  const roleLegendItems = [];
  for (const role of roles) {
    const count = segments.filter(s => s.role === role || (role === 'say' && s.role === 'assistant-manual')).length;
    const bg = role === 'say' ? ROLE_BG['assistant-manual'] : role === 'system' ? ROLE_BG.system : ROLE_BG[role];
    roleLegendItems.push(`<div class="timeline__legend"><span class="timeline__legend-dot" style="background:${bg}"></span>${roleLabels[role]} (${count})</div>`);
  }
  if (hasSystem) {
    roleLegendItems.push(`<div class="timeline__legend"><span class="timeline__legend-dot" style="background:${SYSTEM_COLORS['assistant-thinking']}"></span>Thinking</div>`);
    roleLegendItems.push(`<div class="timeline__legend"><span class="timeline__legend-dot" style="background:${SYSTEM_COLORS.calling}"></span>Fn Dispatch</div>`);
    roleLegendItems.push(`<div class="timeline__legend"><span class="timeline__legend-dot" style="background:${SYSTEM_COLORS.step}"></span>Step</div>`);
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
    <div class="timeline">
      <div class="timeline__bar">
        <div class="timeline__title">Call Phases</div>
        <div class="swimlane__row">
          <div class="swimlane__row-label" style="width:${LABEL_WIDTH}px">Phases</div>
          <div class="swimlane__track timeline__track--macro">${macroHtml}</div>
        </div>
        <div class="timeline__legends" style="padding-left:${LABEL_WIDTH + 12}px">${macroLegend}</div>
      </div>
      <div class="timeline__bar" style="margin-top:1rem">
        <div class="timeline__title">Conversation Flow <span style="font-weight:400;color:var(--text-muted);font-size:0.75rem">(from Answer)</span></div>
        <div class="swimlane" id="swimlane" style="position:relative">
          ${aiMarkerHtml}
          ${swimlaneRows}
        </div>
        <div class="timeline__legends" style="padding-left:${LABEL_WIDTH + 12}px">${roleLegend}</div>
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
      const execLat = parseInt(seg.dataset.execLatency) || 0;
      const funcLat = parseInt(seg.dataset.funcLatency) || 0;

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
      html += `<div class="swimlane__tooltip-row"><span>Round-trip</span><strong>${formatMs(execLat)}</strong></div>`;
      if (funcLat > 0) {
        html += `<div class="swimlane__tooltip-row"><span>Function time</span><strong>${formatMs(funcLat)}</strong></div>`;
        const overhead = execLat - funcLat;
        if (overhead > 0) html += `<div class="swimlane__tooltip-row"><span>Network overhead</span><span>${formatMs(overhead)}</span></div>`;
      }
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
