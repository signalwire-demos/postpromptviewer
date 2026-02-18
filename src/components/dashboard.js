import { formatDuration } from '../../lib/utils.js';

export function renderDashboard(container, metrics) {
  const d = metrics.duration;
  const l = metrics.latency;
  const a = metrics.asr;
  const c = metrics.conversation;
  const t = metrics.tools;
  const tk = metrics.tokens;

  const e = metrics.enriched || {};
  const sections = [];

  // Duration
  sections.push({
    title: 'Duration',
    cards: [
      { label: 'Call Duration', value: formatDuration(d.callDuration), unit: d.callInProgress ? 'In progress' : '' },
      { label: 'AI Session', value: formatDuration(d.aiSessionDuration) },
      { label: 'Ring Time', value: formatDuration(d.ringTime) },
      { label: 'AI Setup', value: formatDuration(d.aiSetupTime) },
    ],
  });

  // Overall Performance
  if (l.overallStats) {
    sections.push({
      title: 'Overall Performance',
      cards: [
        { label: 'Average', value: `${l.overallStats.avg}`, unit: 'ms' },
        { label: 'Median', value: `${l.overallStats.median}`, unit: 'ms' },
        { label: 'Range', value: `${l.overallStats.min} - ${l.overallStats.max}`, unit: 'ms' },
        ...(l.assistantStats ? [{
          label: 'Under Target',
          value: `${l.assistantStats.underTarget}/${l.assistantStats.count}`,
          unit: `(${Math.round(l.assistantStats.underTarget / l.assistantStats.count * 100)}%) < 1200ms`,
        }] : []),
        ...(l.p95AnswerTime != null ? [{ label: 'P95', value: l.p95AnswerTime, unit: 'ms' }] : []),
      ],
    });
  }

  // Assistant Responses
  if (l.assistantStats) {
    sections.push({
      title: 'Assistant Responses',
      subtitle: 'AI-controlled latency (LLM + TTS + audio)',
      cards: [
        { label: 'Average', value: `${l.assistantStats.avg}`, unit: 'ms' },
        { label: 'Fastest', value: `${l.assistantStats.min}`, unit: 'ms' },
        { label: 'Slowest', value: `${l.assistantStats.max}`, unit: 'ms' },
        { label: 'Count', value: l.assistantStats.count },
      ],
    });
  }

  // Tool Calls
  if (l.toolStats) {
    sections.push({
      title: 'Tool Calls',
      subtitle: 'External SWAIG round-trip (not AI-controlled)',
      cards: [
        { label: 'Average', value: `${l.toolStats.avg}`, unit: 'ms' },
        { label: 'Fastest', value: `${l.toolStats.min}`, unit: 'ms' },
        { label: 'Slowest', value: `${l.toolStats.max}`, unit: 'ms' },
        { label: 'Count', value: l.toolStats.count },
      ],
    });
  }

  // Performance Rating
  if (l.assistantStats) {
    const ratingHtml = `
      <div class="dashboard__section">
        <div class="dashboard__section-header">
          <h3 class="dashboard__section-title">System Performance Rating</h3>
        </div>
        <div class="dashboard__grid">
          <div class="metric-card metric-card--rating">
            <div class="metric-card__label">Rating</div>
            <div class="metric-card__value" style="color:${l.performanceColor}">${l.performanceRating}</div>
            <div class="metric-card__unit">Based on assistant responses only. Target: &lt; 1200ms avg</div>
          </div>
          ${l.toolStats ? `
          <div class="metric-card metric-card--note">
            <div class="metric-card__label">Note</div>
            <div class="metric-card__value" style="font-size:0.85rem;font-weight:400;line-height:1.5">
              Tool calls (avg ${l.toolStats.avg}ms) excluded from rating — they depend on external APIs.
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    // We'll append this separately
    sections.push({ _ratingHtml: ratingHtml });
  }

  // Conversation
  sections.push({
    title: 'Conversation',
    cards: [
      { label: 'Turns', value: c.turnCount },
      { label: 'User Messages', value: a.totalUserMessages },
      { label: 'Total Words', value: c.totalWords },
      { label: 'ASR Confidence', value: a.avgConfidence ? `${(a.avgConfidence * 100).toFixed(1)}` : 'N/A', unit: a.avgConfidence ? '%' : '', na: !a.avgConfidence },
      { label: 'Barge-In Rate', value: a.bargeInRate ? `${(a.bargeInRate * 100).toFixed(0)}` : '0', unit: `% (${a.bargeInCount})` },
      { label: 'Agent Responses', value: l.agentResponseCount },
      { label: 'Avg Response', value: l.avgResponseLength ? Math.round(l.avgResponseLength) : 'N/A', unit: 'words' },
      ...(a.avgBargeInDepth > 0 ? [{ label: 'Avg Barge Depth', value: a.avgBargeInDepth.toFixed(1) }] : []),
    ],
  });

  // Tokens
  sections.push({
    title: 'Tokens',
    cards: [
      { label: 'Input Tokens', value: tk.hasInputTokenData ? tk.totalInputTokens.toLocaleString() : 'N/A', na: !tk.hasInputTokenData },
      { label: 'Output Tokens', value: tk.hasOutputTokenData ? tk.totalOutputTokens.toLocaleString() : 'N/A', na: !tk.hasOutputTokenData },
      { label: 'Avg TPS', value: tk.avgTps ? `${Math.round(tk.avgTps)}` : 'N/A', unit: tk.avgTps ? 'tok/s' : '', na: !tk.avgTps },
      { label: 'Peak TPS', value: tk.peakTps ? `${Math.round(tk.peakTps)}` : 'N/A', unit: tk.peakTps ? 'tok/s' : '', na: !tk.peakTps },
    ],
  });

  // SWAIG details (if any)
  if (t.swaigCallCount > 0) {
    sections.push({
      title: 'SWAIG Details',
      cards: [
        { label: 'Total Calls', value: t.swaigCallCount },
        { label: 'Avg Execution', value: t.avgExecutionLatency ? `${Math.round(t.avgExecutionLatency)}` : 'N/A', unit: t.avgExecutionLatency ? 'ms (round-trip)' : '', na: !t.avgExecutionLatency },
        { label: 'Avg Function', value: t.avgFunctionLatency ? `${Math.round(t.avgFunctionLatency)}` : 'N/A', unit: t.avgFunctionLatency ? 'ms (remote only)' : '', na: !t.avgFunctionLatency },
        { label: 'Action Types', value: t.actionTypes.length ? t.actionTypes.length : 'None', unit: t.actionTypes.length ? t.actionTypes.map(a => `<span class="metric-card__tag">${a}</span>`).join(' ') : '', na: !t.actionTypes.length },
        { label: 'Call Rate', value: t.toolCallRate ? t.toolCallRate.toFixed(1) : 'N/A', unit: 'calls/min' },
      ],
    });
  }

  // Media & Billing
  const hasMediaData = tk.totalTtsChars != null || tk.totalAsrMinutes != null;
  const hasBillingData = tk.totalWireInputTokens != null;
  if (hasMediaData || hasBillingData) {
    sections.push({
      title: 'Media & Billing',
      cards: [
        { label: 'TTS Characters', value: tk.totalTtsChars != null ? tk.totalTtsChars.toLocaleString() : 'N/A' },
        { label: 'TTS Chars/min', value: tk.totalTtsCharsPerMin != null ? Math.round(tk.totalTtsCharsPerMin) : 'N/A' },
        { label: 'ASR Minutes', value: tk.totalAsrMinutes != null ? tk.totalAsrMinutes.toFixed(2) : 'N/A' },
        { label: 'Wire Input', value: tk.totalWireInputTokens != null ? tk.totalWireInputTokens.toLocaleString() : 'N/A', unit: 'tokens' },
        { label: 'Wire Output', value: tk.totalWireOutputTokens != null ? tk.totalWireOutputTokens.toLocaleString() : 'N/A', unit: 'tokens' },
      ],
    });
  }

  // Enriched Event Metrics (only show if any enriched data is present)
  const hasEnrichedData = e.functionErrorCount > 0 || e.gatherRejectCount > 0 ||
    e.textRewriteCount > 0 || e.fillerCount > 0 || e.attentionTimeoutCount > 0 ||
    e.startupHookDuration != null || e.bargedCount > 0;

  if (hasEnrichedData) {
    const enrichedCards = [];

    if (e.functionErrorCount > 0) {
      enrichedCards.push({
        label: 'Function Error Rate',
        value: `${(e.functionErrorRate * 100).toFixed(1)}`,
        unit: `% (${e.functionErrorCount}/${e.functionCallCount})`,
      });
    }

    if (e.gatherRejectCount > 0) {
      enrichedCards.push({
        label: 'Gather Rejection Rate',
        value: `${(e.gatherRejectionRate * 100).toFixed(1)}`,
        unit: `% (${e.gatherRejectCount} rejected)`,
      });
    }

    if (e.avgGatherAttempts > 0) {
      enrichedCards.push({
        label: 'Avg Gather Attempts',
        value: e.avgGatherAttempts.toFixed(1),
      });
    }

    if (e.textRewriteCount > 0) {
      enrichedCards.push({
        label: 'Text Rewrites',
        value: e.textRewriteCount,
        unit: `${e.hearingHintCount} ASR + ${e.pronounceRuleCount} TTS`,
      });
    }

    if (e.fillerCount > 0) {
      enrichedCards.push({
        label: 'Filler Count',
        value: e.fillerCount,
        unit: 'thinking fillers',
      });
    }

    if (e.attentionTimeoutCount > 0) {
      enrichedCards.push({
        label: 'Attention Timeouts',
        value: e.attentionTimeoutCount,
      });
    }

    if (e.startupHookDuration != null) {
      enrichedCards.push({
        label: 'Startup Hook',
        value: e.startupHookDuration,
        unit: 'ms',
      });
    }

    if (e.bargedCount > 0) {
      enrichedCards.push({
        label: 'Responses Interrupted',
        value: `${(e.bargedRate * 100).toFixed(0)}`,
        unit: `% (${e.bargedCount}/${e.totalAssistantContent})`,
      });
      if (e.avgBargeElapsedMs != null) {
        enrichedCards.push({
          label: 'Avg Listen Before Barge',
          value: `${(e.avgBargeElapsedMs / 1000).toFixed(1)}`,
          unit: 's',
        });
      }
      if (e.avgResponseHeardPct != null) {
        enrichedCards.push({
          label: 'Avg Response Heard',
          value: `${e.avgResponseHeardPct}`,
          unit: '%',
        });
      }
    }

    sections.push({
      title: 'Enriched Events',
      subtitle: 'Errors, rewrites, fillers, barge-ins, and lifecycle events',
      cards: enrichedCards,
    });
  }

  container.innerHTML = `
    <div class="dashboard">
      ${sections.map(section => {
        if (section._ratingHtml) return section._ratingHtml;
        return `
          <div class="dashboard__section">
            <div class="dashboard__section-header">
              <h3 class="dashboard__section-title">${section.title}</h3>
              ${section.subtitle ? `<span class="dashboard__section-subtitle">${section.subtitle}</span>` : ''}
            </div>
            <div class="dashboard__grid">
              ${section.cards.map(card => `
                <div class="metric-card${card.na ? ' metric-card--na' : ''}">
                  <div class="metric-card__label">${card.label}</div>
                  <div class="metric-card__value">${card.value}</div>
                  ${card.unit ? `<div class="metric-card__unit">${card.unit}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
