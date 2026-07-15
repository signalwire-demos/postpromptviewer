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

  const scorecardEntriesHtml = (entries) => `
    <div class="scorecard__grid">
      ${entries.bars.map(b => `
        <div class="scorecard__metric">
          <div class="scorecard__metric-head">
            <span class="scorecard__metric-name">${b.key.replace(/_/g, ' ')}${b.inverted ? ' (lower is better)' : ''}</span>
            <span class="scorecard__metric-value">${b.pct}%</span>
          </div>
          <div class="scorecard__track">
            <div class="scorecard__fill scorecard__fill--${b.good ? 'good' : 'bad'}" style="width:${b.pct}%"></div>
          </div>
        </div>
      `).join('')}
    </div>
    ${entries.chips.length ? `
      <div class="scorecard__chips">
        ${entries.chips.map(ch => `<span class="badge badge-outline badge-sm">${ch.key}: ${ch.value}</span>`).join('')}
      </div>
    ` : ''}
  `;

  // Scorecards: agent-set global_data.scorecard and/or the utility model's
  // inner_dialog_scorecard self-assessment
  if (metrics.scorecard) {
    const parts = [];
    if (metrics.scorecard.global) {
      parts.push(`<div class="mb-3"><div class="text-xs opacity-50 mb-2">From global_data.scorecard</div>${scorecardEntriesHtml(metrics.scorecard.global)}</div>`);
    }
    if (metrics.scorecard.dialog) {
      parts.push(`<div class="mb-3"><div class="text-xs opacity-50 mb-2">Inner-dialog self-assessment</div>${scorecardEntriesHtml(metrics.scorecard.dialog)}</div>`);
    }
    sections.push({
      _ratingHtml: `
        <div class="mb-6">
          <h3 class="text-lg font-bold mb-3" style="font-family: var(--font-heading)">Scorecard</h3>
          ${parts.join('')}
        </div>
      `,
    });
  }

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

  // User-perceived latency (mouth-to-ear) — only present on new-format calls
  if (l.perceivedStats || l.eosToPushStats || l.pollStats) {
    sections.push({
      title: 'User-Perceived Latency',
      subtitle: 'Anchored at the caller’s last spoken word (acoustic pipeline)',
      cards: [
        ...(l.perceivedStats ? [
          { label: 'Perceived Avg', value: `${l.perceivedStats.avg}`, unit: 'ms mouth-to-ear' },
          { label: 'Perceived P95', value: `${l.perceivedStats.p95}`, unit: 'ms' },
        ] : []),
        ...(l.eosToPushStats ? [{ label: 'Turn Detection', value: `${l.eosToPushStats.avg}`, unit: 'ms avg (eos → push)' }] : []),
        ...(l.dgDecisionStats ? [{ label: 'DG Decision', value: `${l.dgDecisionStats.avg}`, unit: 'ms avg (decide → push)' }] : []),
        ...(l.pollStats ? [{ label: 'Poll Gap', value: `${l.pollStats.avg}`, unit: 'ms avg (push → read)' }] : []),
      ],
    });
  }

  // Tool Calls
  if (l.toolStats) {
    sections.push({
      title: 'Tool Calls',
      subtitle: 'SWAIG function execution time (end − start, not AI-controlled)',
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
      <div class="mb-6">
        <h3 class="text-lg font-bold mb-3" style="font-family: var(--font-heading)">System Performance Rating</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="stat bg-base-200 rounded-box shadow-sm">
            <div class="stat-title">Rating</div>
            <div class="stat-value text-lg" style="color:${l.performanceColor}">${l.performanceRating}</div>
            <div class="stat-desc">Based on assistant responses only. Target: &lt; 1200ms avg</div>
          </div>
          ${l.toolStats ? `
          <div class="stat bg-base-200 rounded-box shadow-sm">
            <div class="stat-title">Note</div>
            <div class="stat-desc mt-2" style="white-space:normal">
              Tool calls (avg ${l.toolStats.avg}ms) excluded from rating &mdash; they depend on external APIs.
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
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
        { label: 'Avg Execution', value: t.avgExecutionLatency ? `${Math.round(t.avgExecutionLatency)}` : 'N/A', unit: t.avgExecutionLatency ? 'ms (end − start)' : '', na: !t.avgExecutionLatency },
        { label: 'Avg Turn Audio', value: t.avgTurnAudioLatency ? `${Math.round(t.avgTurnAudioLatency)}` : 'N/A', unit: t.avgTurnAudioLatency ? 'ms (surrounding turn)' : '', na: !t.avgTurnAudioLatency },
        { label: 'Action Types', value: t.actionTypes.length ? t.actionTypes.length : 'None', unit: t.actionTypes.length ? t.actionTypes.map(a => `<span class="badge badge-outline badge-xs">${a}</span>`).join(' ') : '', na: !t.actionTypes.length },
        { label: 'Call Rate', value: t.toolCallRate ? t.toolCallRate.toFixed(1) : 'N/A', unit: 'calls/min' },
        ...(t.distilledCount > 0 ? [{ label: 'Distilled Results', value: t.distilledCount }] : []),
      ],
    });
  }

  // ASR turn telemetry (entity / end-of-turn / hold timing) — new format only
  if (a.hasTurnTelemetry) {
    const entityBadges = a.entities.map(en =>
      `<span class="badge badge-outline badge-xs" title="${en.text.replace(/"/g, '&quot;')}">${en.valid ? '✓' : '✕'} ${en.type}: ${en.value}</span>`
    ).join(' ');
    sections.push({
      title: 'Turn Detection & Entities',
      subtitle: 'mod_deepgram turn telemetry (entity capture, end-of-turn, dictation hold)',
      cards: [
        { label: 'Entities Captured', value: a.entities.length, unit: entityBadges },
        ...(a.avgEotConfidence != null ? [{ label: 'EOT Confidence', value: `${(a.avgEotConfidence * 100).toFixed(0)}`, unit: '% avg' }] : []),
        ...(a.ceilingCount > 0 ? [{ label: 'Forced Turn Ends', value: a.ceilingCount, unit: 'hit hold cap — consider re-prompting' }] : []),
        ...(a.avgCommitLatencyMs != null ? [{ label: 'Avg Commit', value: Math.round(a.avgCommitLatencyMs), unit: 'ms (EOT hold)' }] : []),
        ...(a.heldTurnCount > 0 ? [{ label: 'Held Turns', value: a.heldTurnCount, unit: 'dictation hold engaged' }] : []),
        ...(a.totalWalkbacks > 0 ? [{ label: 'Walkbacks', value: a.totalWalkbacks, unit: 'retracted end-of-turn decisions' }] : []),
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
        ...(tk.totalMinutes != null ? [{
          label: 'Est. AI Cost',
          value: `$${(tk.totalMinutes * 0.16).toFixed(2)}`,
          unit: `${tk.totalMinutes.toFixed(2)} min × $0.16/min`,
        }] : []),
      ],
    });
  }

  // Enriched Event Metrics (only show if any enriched data is present)
  const hasEnrichedData = e.functionErrorCount > 0 || e.gatherRejectCount > 0 ||
    e.textRewriteCount > 0 || e.totalFillerCount > 0 || e.attentionTimeoutCount > 0 ||
    e.startupHookDuration != null || e.bargedCount > 0 ||
    e.innerDialogCount > 0 || e.redactedMessageCount > 0 ||
    e.functionLoopCount > 0 || e.swaigProblemCount > 0 ||
    e.changeStepFailedCount > 0 || e.doubleTurnCount > 0 ||
    e.innerDialogScorecardCount > 0 || e.manualSayErrorCount > 0;

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

    if (e.functionLoopCount > 0) {
      enrichedCards.push({
        label: 'Function Loops Broken',
        value: e.functionLoopCount,
        unit: 'runaway call loops detected',
      });
    }

    if (e.swaigProblemCount > 0) {
      enrichedCards.push({
        label: 'SWAIG Problems',
        value: e.swaigProblemCount,
        unit: 'webhooks with no usable response',
      });
    }

    if (e.changeStepFailedCount > 0) {
      enrichedCards.push({
        label: 'Step Changes Failed',
        value: e.changeStepFailedCount,
        unit: 'navigation to unknown steps',
      });
    }

    if (e.manualSayErrorCount > 0) {
      enrichedCards.push({
        label: 'Error Recoveries',
        value: e.manualSayErrorCount,
        unit: 'spoken error-recovery messages',
      });
    }

    if (e.textRewriteCount > 0) {
      const parts = [];
      if (e.hearingHintCount) parts.push(`${e.hearingHintCount} ASR`);
      if (e.pronounceCount) parts.push(`${e.pronounceCount} TTS`);
      if (e.autoCorrectCount) parts.push(`${e.autoCorrectCount} auto-correct`);
      if (e.textNormalizeCount) parts.push(`${e.textNormalizeCount} ITN`);
      enrichedCards.push({
        label: 'Text Rewrites',
        value: e.textRewriteCount,
        unit: parts.join(' + '),
      });
    }

    if (e.totalFillerCount > 0) {
      const parts = [];
      if (e.fillerCount) parts.push(`${e.fillerCount} events`);
      if (e.textModeFillerCount) parts.push(`${e.textModeFillerCount} text-mode`);
      enrichedCards.push({
        label: 'Filler Count',
        value: e.totalFillerCount,
        unit: parts.join(' + '),
      });
    }

    if (e.attentionTimeoutCount > 0) {
      enrichedCards.push({
        label: 'Attention Timeouts',
        value: e.attentionTimeoutCount,
      });
    }

    if (e.innerDialogCount > 0 || e.innerDialogScorecardCount > 0) {
      enrichedCards.push({
        label: 'Inner Dialogs',
        value: e.innerDialogCount + e.innerDialogScorecardCount,
        unit: e.innerDialogScorecardCount ? `${e.innerDialogScorecardCount} scorecards` : '',
      });
    }

    if (e.doubleTurnCount > 0) {
      enrichedCards.push({
        label: 'Double Turns',
        value: e.doubleTurnCount,
        unit: 'hidden follow-up directives',
      });
    }

    if (e.redactedMessageCount > 0) {
      enrichedCards.push({
        label: 'Redacted Messages',
        value: e.redactedMessageCount,
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
    <div class="p-6 max-w-7xl mx-auto space-y-6">
      ${sections.map(section => {
        if (section._ratingHtml) return section._ratingHtml;
        return `
          <div class="mb-6">
            <div class="flex items-baseline gap-3 mb-3">
              <h3 class="text-lg font-bold" style="font-family: var(--font-heading)">${section.title}</h3>
              ${section.subtitle ? `<span class="text-xs opacity-50">${section.subtitle}</span>` : ''}
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              ${section.cards.map(card => `
                <div class="stat bg-base-200 rounded-box shadow-sm p-4 ${card.na ? 'opacity-50' : ''}">
                  <div class="stat-title text-xs">${card.label}</div>
                  <div class="stat-value text-xl">${card.value}</div>
                  ${card.unit ? `<div class="stat-desc text-xs">${card.unit}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
