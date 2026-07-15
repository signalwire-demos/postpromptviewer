import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

Chart.register(
  LineController, BarController, DoughnutController,
  LineElement, BarElement, ArcElement, PointElement,
  LinearScale, CategoryScale, Tooltip, Legend, Filler,
);

const COLORS = {
  blue: '#044EF4',
  green: '#22c55e',
  yellow: '#FFD700',
  red: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#40E0D0',
  gray: '#6b7280',
  indigo: '#818cf8',
  pink: '#F72A72',
};

// Stacked segment colors — the full pipeline anchored at user-stopped-talking
const SEGMENT = {
  turnDetection: 'rgba(34, 197, 94, 0.7)',
  poll: 'rgba(148, 163, 184, 0.7)',
  llmAssistant: 'rgba(147, 51, 234, 0.8)',
  utteranceAssistant: 'rgba(251, 191, 36, 0.8)',
  audioAssistant: 'rgba(129, 140, 248, 0.8)',
  toolExecution: 'rgba(245, 158, 11, 0.6)',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#1e1e1f',
  borderColor: '#333338',
  borderWidth: 1,
  titleColor: '#ffffff',
  bodyColor: '#9ca3af',
  padding: 10,
};

const SCALE_STYLE = {
  x: {
    ticks: { color: '#6b7280', font: { size: 11 } },
    grid: { color: 'rgba(45, 50, 68, 0.3)' },
  },
  y: {
    ticks: { color: '#6b7280', font: { size: 11 } },
    grid: { color: 'rgba(45, 50, 68, 0.3)' },
  },
};

let activeCharts = [];
function destroyCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
}

export function renderCharts(container, payload, metrics) {
  destroyCharts();
  const l = metrics.latency;
  const tk = metrics.tokens;
  const a = metrics.asr;
  const c = metrics.conversation;
  const t = metrics.tools;

  const chartDefs = [];

  // ─── 1. Latency Breakdown (assistant pipeline top, tool execution bottom) ───
  if (l.perResponseBreakdown.length > 0) {
    chartDefs.push({
      title: 'Latency Pipeline',
      id: 'chart-latency-breakdown',
      dual: true, // signals custom two-canvas rendering
      render: (wrapper) => {
        // Assistant pipeline, anchored at user-stopped-talking per the spec:
        // turn detection (eos_to_push) → poll → model TTFT → utterance →
        // audio. acoustic_latency is the full-extent perceived reference.
        const breakdown = l.perResponseBreakdown.filter(r => r.role === 'assistant');
        const labels = breakdown.map((r, i) => `Turn ${i + 1}`);

        const aTurnDetect = breakdown.map(r => r.turnDetection || 0);
        const aPoll = breakdown.map(r => r.poll || 0);
        const aLlm = breakdown.map(r => r.llm);
        const aUtterance = breakdown.map(r => r.utteranceProcessing);
        const aAudio = breakdown.map(r => r.audioDelivery);
        const aPerceived = breakdown.map(r => r.perceivedTotal); // null-skipped line
        const hasPipeline = breakdown.some(r => r.turnDetection != null || r.poll != null);
        const hasPerceived = breakdown.some(r => r.perceivedTotal != null);

        // Tool rows: real execution time (end − start), not the deprecated
        // execution_latency alias (which is the surrounding turn's audio).
        const toolRows = l.perResponseBreakdown.filter(r => r.role === 'tool');
        const toolLabels = toolRows.map((r, i) => `Tool ${i + 1}`);
        const toolExec = toolRows.map(r => r.functionExecutionMs || 0);

        // Reference line plugin (assistant chart only)
        const assistantStats = l.assistantStats;
        const refLinePlugin = {
          id: 'latencyRefLines',
          afterDraw: (chart) => {
            if (!assistantStats) return;
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            ctx.save();

            // Min — cyan dashed
            const minY = yAxis.getPixelForValue(assistantStats.min);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, minY);
            ctx.lineTo(xAxis.right, minY);
            ctx.stroke();

            // Avg — green dashed
            const avgY = yAxis.getPixelForValue(assistantStats.avg);
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, avgY);
            ctx.lineTo(xAxis.right, avgY);
            ctx.stroke();

            const targetY = yAxis.getPixelForValue(1200);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, targetY);
            ctx.lineTo(xAxis.right, targetY);
            ctx.stroke();

            const maxY = yAxis.getPixelForValue(assistantStats.max);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, maxY);
            ctx.lineTo(xAxis.right, maxY);
            ctx.stroke();

            ctx.restore();
          },
        };

        const toolStats = l.toolStats;

        const sharedBarOpts = { borderWidth: 0, barPercentage: 0.6, categoryPercentage: 0.8, stack: 'bars' };

        const tooltipCallbacks = {
          title: (items) => `Turn ${items[0].dataIndex + 1}`,
          label: (ctx) => {
            const val = ctx.parsed.y || 0;
            if (val > 0) return `${ctx.dataset.label}: ${Math.round(val)}ms`;
            return '';
          },
          afterBody: (items) => {
            const idx = items[0].dataIndex;
            const r = breakdown[idx];
            const lines = [`Model+delivery: ${r.total}ms`];
            if (r.perceivedTotal != null) lines.push(`User-perceived (acoustic): ${r.perceivedTotal}ms`);
            if (r.barged) lines.push('Interrupted by caller');
            return lines;
          },
        };

        // ── Top chart: Assistant responses ──
        const topCanvas = wrapper.querySelector('.chart-latency-top');
        const topChart = new Chart(topCanvas, {
          type: 'bar',
          plugins: [refLinePlugin],
          data: {
            labels,
            datasets: [
              ...(hasPipeline ? [
                { label: 'Turn Detection', data: aTurnDetect, backgroundColor: SEGMENT.turnDetection, ...sharedBarOpts },
                { label: 'Poll', data: aPoll, backgroundColor: SEGMENT.poll, ...sharedBarOpts },
              ] : []),
              { label: 'LLM Latency', data: aLlm, backgroundColor: SEGMENT.llmAssistant, ...sharedBarOpts },
              { label: 'Utterance Processing', data: aUtterance, backgroundColor: SEGMENT.utteranceAssistant, ...sharedBarOpts },
              { label: 'Audio Delivery', data: aAudio, backgroundColor: SEGMENT.audioAssistant, ...sharedBarOpts },
              ...(hasPerceived ? [{
                type: 'line',
                label: 'Perceived (acoustic)',
                data: aPerceived,
                borderColor: COLORS.pink,
                backgroundColor: COLORS.pink,
                pointStyle: 'rectRot',
                pointRadius: 5,
                showLine: false,
                spanGaps: false,
                stack: undefined,
              }] : []),
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: {
                  color: '#9ca3af',
                  usePointStyle: false,
                  boxWidth: 15,
                  padding: 12,
                  font: { size: 11 },
                  generateLabels: (chart) => {
                    const base = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                    if (assistantStats) {
                      base.push(
                        { text: `Min: ${assistantStats.min}ms`, fillStyle: 'transparent', strokeStyle: 'rgba(34, 211, 238, 0.8)', lineWidth: 2, lineDash: [3, 3], hidden: false, index: 99 },
                        { text: `Avg: ${assistantStats.avg}ms`, fillStyle: 'transparent', strokeStyle: 'rgba(34, 197, 94, 0.8)', lineWidth: 2, lineDash: [5, 5], hidden: false, index: 100 },
                        { text: 'Target: 1200ms', fillStyle: 'transparent', strokeStyle: 'rgba(251, 191, 36, 0.8)', lineWidth: 2, lineDash: [10, 5], hidden: false, index: 101 },
                        { text: `Max: ${assistantStats.max}ms`, fillStyle: 'transparent', strokeStyle: 'rgba(239, 68, 68, 0.8)', lineWidth: 2, lineDash: [3, 3], hidden: false, index: 102 },
                      );
                    }
                    return base;
                  },
                },
              },
              tooltip: { ...TOOLTIP_STYLE, callbacks: tooltipCallbacks },
            },
            scales: {
              x: { stacked: true, ...SCALE_STYLE.x, display: false },
              y: { stacked: true, ...SCALE_STYLE.y, beginAtZero: true, title: { display: true, text: 'Assistant (ms)', color: '#6b7280' } },
            },
          },
        });

        // ── Bottom chart: Tool calls ──
        const toolRefLinePlugin = {
          id: 'toolRefLines',
          afterDraw: (chart) => {
            if (!toolStats) return;
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            ctx.save();

            // Tool Min — cyan dashed
            const minY = yAxis.getPixelForValue(toolStats.min);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, minY);
            ctx.lineTo(xAxis.right, minY);
            ctx.stroke();

            // Tool Average — green dashed
            const avgY = yAxis.getPixelForValue(toolStats.avg);
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, avgY);
            ctx.lineTo(xAxis.right, avgY);
            ctx.stroke();

            // Tool Max — red dashed
            const maxY = yAxis.getPixelForValue(toolStats.max);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, maxY);
            ctx.lineTo(xAxis.right, maxY);
            ctx.stroke();

            ctx.restore();
          },
        };

        const botCanvas = wrapper.querySelector('.chart-latency-bot');
        if (toolRows.length === 0) {
          botCanvas.closest('div')?.remove();
          return [topChart];
        }
        const botChart = new Chart(botCanvas, {
          type: 'bar',
          plugins: [toolRefLinePlugin],
          data: {
            labels: toolLabels,
            datasets: [
              { label: 'Execution (end − start)', data: toolExec, backgroundColor: SEGMENT.toolExecution, ...sharedBarOpts },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: {
                  color: '#9ca3af',
                  usePointStyle: false,
                  boxWidth: 15,
                  padding: 12,
                  font: { size: 11 },
                  generateLabels: (chart) => {
                    const base = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                    if (toolStats) {
                      base.push(
                        { text: `Min: ${toolStats.min}ms`, fillStyle: 'transparent', strokeStyle: 'rgba(34, 211, 238, 0.8)', lineWidth: 2, lineDash: [3, 3], hidden: false, index: 100 },
                        { text: `Avg: ${toolStats.avg}ms`, fillStyle: 'transparent', strokeStyle: 'rgba(34, 197, 94, 0.8)', lineWidth: 2, lineDash: [5, 5], hidden: false, index: 101 },
                        { text: `Max: ${toolStats.max}ms`, fillStyle: 'transparent', strokeStyle: 'rgba(239, 68, 68, 0.8)', lineWidth: 2, lineDash: [3, 3], hidden: false, index: 102 },
                      );
                    }
                    return base;
                  },
                },
              },
              tooltip: {
                ...TOOLTIP_STYLE,
                callbacks: {
                  title: (items) => toolLabels[items[0].dataIndex],
                  label: (ctx) => `Execution: ${Math.round(ctx.parsed.y || 0)}ms`,
                },
              },
            },
            scales: {
              x: { stacked: true, ...SCALE_STYLE.x, title: { display: true, text: 'Tool Calls', color: '#6b7280' } },
              y: { stacked: true, ...SCALE_STYLE.y, beginAtZero: true, title: { display: true, text: 'Execution (ms)', color: '#6b7280' } },
            },
          },
        });

        return [topChart, botChart];
      },
    });
  }

  // ─── 2. Tokens Per Second ───
  if (tk.perResponseTps.length > 0) {
    chartDefs.push({
      title: 'Tokens Per Second',
      id: 'chart-tps',
      render: (canvas) => {
        // Use perResponseTimes to color-code tool dispatches
        const times = l.perResponseTimes;
        const tpsData = tk.perResponseTps;
        const labels = times.map((r, i) => r.isToolCall ? `T${i + 1}` : `R${i + 1}`);
        const data = tpsData.map(r => r.tps);
        const bgColors = tpsData.map((r, i) => {
          if (r.tps === 0 && r.tokens > 0) return 'rgba(139,92,246,0.5)'; // unmeasurable
          return (times[i] && times[i].isToolCall) ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.6)';
        });

        return new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'TPS',
              data,
              backgroundColor: bgColors,
              borderColor: bgColors.map(c => c.replace(/[\d.]+\)$/, '1)')),
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...TOOLTIP_STYLE,
                callbacks: {
                  label: (ctx) => {
                    const r = tpsData[ctx.dataIndex];
                    if (r.tps === 0 && r.tokens > 0) {
                      return `${r.tokens} tokens (timing unavailable)`;
                    }
                    return `TPS: ${Math.round(r.tps)} (${r.tokens} tokens)`;
                  },
                  afterBody: (items) => {
                    // times[] is per-generation: a spoken-text generation
                    // that matched no call_log turn was abandoned/regenerated
                    const r = times[items[0].dataIndex];
                    if (r && !r.isToolCall && !r.matchedSpokenTurn && r.responseWordCount > 0) {
                      return ['Not spoken (abandoned or regenerated)'];
                    }
                    return [];
                  },
                },
              },
            },
            scales: {
              x: { ...SCALE_STYLE.x },
              y: { ...SCALE_STYLE.y, beginAtZero: true, title: { display: true, text: 'TPS', color: '#6b7280' } },
            },
          },
        });
      },
    });
  }

  // ─── 3. ASR Confidence per Utterance ───
  if (a.perMessage.length > 0) {
    chartDefs.push({
      title: 'ASR Confidence per Utterance',
      id: 'chart-asr',
      render: (canvas) => {
        const msgs = a.perMessage;
        const labels = msgs.map((m, i) => `Msg ${i + 1}`);
        const data = msgs.map(m => Math.round(m.confidence * 100));
        const bgColors = msgs.map(m => {
          if (m.confidence >= 0.8) return 'rgba(16, 185, 129, 0.7)';
          if (m.confidence >= 0.5) return 'rgba(245, 158, 11, 0.7)';
          return 'rgba(239, 68, 68, 0.7)';
        });
        const borderColors = msgs.map(m => {
          if (m.confidence >= 0.8) return COLORS.green;
          if (m.confidence >= 0.5) return COLORS.yellow;
          return COLORS.red;
        });

        return new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Confidence',
              data,
              backgroundColor: bgColors,
              borderColor: borderColors,
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...TOOLTIP_STYLE,
                callbacks: {
                  title: (items) => {
                    const idx = items[0].dataIndex;
                    const text = msgs[idx].text;
                    return text.length > 60 ? text.slice(0, 57) + '...' : text || '(no text)';
                  },
                  label: (ctx) => `Confidence: ${ctx.parsed.y}%`,
                  afterBody: (items) => {
                    const m = msgs[items[0].dataIndex];
                    const lines = [];
                    if (m.entity?.value) lines.push(`Entity: ${m.entity.type} ${m.entity.value}${m.entity.valid ? ' ✓' : ' ✕'}`);
                    if (m.eot?.basis) lines.push(`End-of-turn: ${m.eot.basis}${m.eot.confidence != null ? ` (${Math.round(m.eot.confidence * 100)}%)` : ''}`);
                    if (m.timing?.walkbacks) lines.push(`Walkbacks: ${m.timing.walkbacks}`);
                    return lines;
                  },
                },
              },
            },
            scales: {
              x: { ...SCALE_STYLE.x },
              y: {
                ...SCALE_STYLE.y,
                beginAtZero: true,
                max: 100,
                title: { display: true, text: 'Confidence %', color: '#6b7280' },
              },
            },
          },
        });
      },
    });
  }

  // ─── 4. Speech Detection Timing ───
  const msgsWithTiming = a.perMessage.filter(m => m.speakingToFinal > 0);
  if (msgsWithTiming.length > 0) {
    chartDefs.push({
      title: 'Speech Detection Timing',
      id: 'chart-speech-timing',
      render: (canvas) => {
        const msgs = msgsWithTiming;
        const labels = msgs.map((m, i) => {
          let label = `Msg ${i + 1}`;
          if (m.isBargeIn) label += ' *';
          if (m.multiMerged) label += ' †';
          return label;
        });

        // Cap y-axis from single-segment messages so a multi-segment
        // merged outlier (whose start_timestamp refers to an earlier
        // segment) can't flatten every other bar. Outliers clip visually.
        const stableTotals = msgs
          .filter(m => !m.multiMerged)
          .map(m => m.speakingToFinal);
        const cap = stableTotals.length
          ? Math.ceil(Math.max(...stableTotals) * 1.2 / 500) * 500
          : undefined;

        return new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Speaking → Turn Detection',
                data: msgs.map(m => m.speakingToTurn),
                backgroundColor: msgs.map(m => m.isBargeIn
                  ? 'rgba(239, 68, 68, 0.5)'
                  : 'rgba(16, 185, 129, 0.6)'),
                borderWidth: 0,
                borderRadius: 2,
                stack: 'timing',
              },
              {
                label: 'Turn Detection → Final Event',
                data: msgs.map(m => m.turnToFinal),
                backgroundColor: msgs.map(m => m.isBargeIn
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(245, 158, 11, 0.6)'),
                borderWidth: 0,
                borderRadius: 2,
                stack: 'timing',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: { color: '#9ca3af', font: { size: 11 }, padding: 12 },
              },
              tooltip: {
                ...TOOLTIP_STYLE,
                callbacks: {
                  title: (items) => {
                    const idx = items[0].dataIndex;
                    const text = msgs[idx].text;
                    const prefix = msgs[idx].isBargeIn ? '(Barge-in) ' : '';
                    return prefix + (text.length > 50 ? text.slice(0, 47) + '...' : text || '(no text)');
                  },
                  afterBody: (items) => {
                    const idx = items[0].dataIndex;
                    const m = msgs[idx];
                    const lines = [`Total: ${m.speakingToFinal}ms`];
                    if (m.isBargeIn) lines.push('* Barge-in: user interrupted assistant');
                    if (m.multiMerged) lines.push('† Merged utterance — timing spans multiple segments');
                    return lines;
                  },
                },
              },
            },
            scales: {
              x: { stacked: true, ...SCALE_STYLE.x },
              y: {
                stacked: true,
                ...SCALE_STYLE.y,
                beginAtZero: true,
                ...(cap ? { max: cap } : {}),
                title: { display: true, text: 'ms', color: '#6b7280' },
              },
            },
          },
        });
      },
    });
  }

  // ─── 5. Message Role Breakdown ───
  if (Object.keys(c.messagesByRole).length > 0) {
    chartDefs.push({
      title: 'Message Role Breakdown',
      id: 'chart-roles',
      render: (canvas) => {
        const roleColors = {
          system: COLORS.purple,
          'system-log': COLORS.gray,
          assistant: COLORS.indigo,
          user: COLORS.green,
          tool: COLORS.yellow,
        };
        const roles = Object.keys(c.messagesByRole);
        return new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: roles,
            datasets: [{
              data: roles.map(r => c.messagesByRole[r]),
              backgroundColor: roles.map(r => roleColors[r] || COLORS.cyan),
              borderColor: '#1e1e1f',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'right',
                labels: { color: '#9ca3af', font: { size: 11 }, padding: 12 },
              },
              tooltip: TOOLTIP_STYLE,
            },
          },
        });
      },
    });
  }

  // ─── 5. SWAIG Execution by Command ───
  const toolNames = Object.keys(t.toolBreakdown).filter(
    n => t.toolBreakdown[n].executionLatencies.length > 0 || t.toolBreakdown[n].turnAudioLatencies.length > 0
  );
  if (toolNames.length > 0) {
    chartDefs.push({
      title: 'SWAIG Latency by Command',
      id: 'chart-swaig',
      render: (canvas) => {
        // Execution = the function's real run time (end − start timestamps).
        // Turn audio = the surrounding LLM turn's audio latency (the
        // deprecated execution_latency alias) shown for context.
        const avgExec = toolNames.map(name => {
          const lats = t.toolBreakdown[name].executionLatencies;
          return lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
        });
        const avgTurnAudio = toolNames.map(name => {
          const lats = t.toolBreakdown[name].turnAudioLatencies;
          return lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
        });
        return new Chart(canvas, {
          type: 'bar',
          data: {
            labels: toolNames,
            datasets: [
              {
                label: 'Execution (end − start)',
                data: avgExec,
                backgroundColor: 'rgba(245,158,11,0.6)',
                borderColor: COLORS.yellow,
                borderWidth: 1,
                borderRadius: 4,
              },
              {
                label: 'Surrounding turn audio',
                data: avgTurnAudio,
                backgroundColor: 'rgba(129,140,248,0.4)',
                borderColor: COLORS.indigo,
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: { color: '#9ca3af', font: { size: 11 }, padding: 12 },
              },
              tooltip: TOOLTIP_STYLE,
            },
            scales: {
              x: { ...SCALE_STYLE.x },
              y: { ...SCALE_STYLE.y, title: { display: true, text: 'ms', color: '#6b7280' } },
            },
          },
        });
      },
    });
  }

  // ─── Render ───
  container.innerHTML = `
    <div class="charts">
      <div class="charts__grid">
        ${chartDefs.map(cd => {
          if (cd.dual) return `
            <div class="chart-card chart-card--wide" id="${cd.id}">
              <div class="chart-card__title">${cd.title}</div>
              <div style="position:relative;height:320px;">
                <canvas class="chart-latency-top"></canvas>
              </div>
              <div style="position:relative;height:320px;">
                <canvas class="chart-latency-bot"></canvas>
              </div>
            </div>`;
          return `
            <div class="chart-card">
              <div class="chart-card__title">${cd.title}</div>
              <div style="position:relative;height:260px;">
                <canvas id="${cd.id}"></canvas>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  for (const cd of chartDefs) {
    if (cd.dual) {
      const wrapper = document.getElementById(cd.id);
      if (wrapper) {
        const charts = cd.render(wrapper);
        if (Array.isArray(charts)) activeCharts.push(...charts);
      }
    } else {
      const canvas = document.getElementById(cd.id);
      if (canvas) {
        const chart = cd.render(canvas);
        if (chart) activeCharts.push(chart);
      }
    }
  }
}
