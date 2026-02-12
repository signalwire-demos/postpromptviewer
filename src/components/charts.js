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
  blue: '#3b82f6',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  gray: '#6b7280',
  indigo: '#818cf8',
};

// Stacked segment colors — brighter for assistant, dimmer for tool
const SEGMENT = {
  llmAssistant: 'rgba(147, 51, 234, 0.8)',
  llmTool: 'rgba(147, 51, 234, 0.5)',
  utteranceAssistant: 'rgba(251, 191, 36, 0.8)',
  utteranceTool: 'rgba(251, 191, 36, 0.5)',
  audioAssistant: 'rgba(129, 140, 248, 0.8)',
  audioTool: 'rgba(129, 140, 248, 0.5)',
  audioToolNone: 'rgba(129, 140, 248, 0.2)',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#1a1d27',
  borderColor: '#2d3244',
  borderWidth: 1,
  titleColor: '#e4e6eb',
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

  // ─── 1. Latency Breakdown (stacked bar with reference lines) ───
  if (l.perResponseBreakdown.length > 0) {
    chartDefs.push({
      title: 'Latency Breakdown',
      id: 'chart-latency-breakdown',
      render: (canvas) => {
        const breakdown = l.perResponseBreakdown;

        // Labels: 💬 Turn N or 🔧 Tool N
        const labels = breakdown.map((r, i) =>
          r.role === 'tool' ? `Tool ${i + 1}` : `Turn ${i + 1}`
        );

        // Segment data
        const llmData = breakdown.map(r => r.llm);
        const utteranceData = breakdown.map(r => r.utteranceProcessing);
        const audioData = breakdown.map(r => r.audioDelivery);

        // Per-bar colors (brighter for assistant, dimmer for tool)
        const llmColors = breakdown.map(r =>
          r.role === 'tool' ? SEGMENT.llmTool : SEGMENT.llmAssistant);
        const utteranceColors = breakdown.map(r =>
          r.role === 'tool' ? SEGMENT.utteranceTool : SEGMENT.utteranceAssistant);
        const audioColors = breakdown.map(r => {
          if (r.role === 'tool' && r.audioDelivery === 0) return SEGMENT.audioToolNone;
          return r.role === 'tool' ? SEGMENT.audioTool : SEGMENT.audioAssistant;
        });

        // Reference line plugin
        const assistantStats = l.assistantStats;
        const refLinePlugin = {
          id: 'latencyRefLines',
          afterDraw: (chart) => {
            if (!assistantStats) return;
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            ctx.save();

            // Assistant Average — green dashed
            const avgY = yAxis.getPixelForValue(assistantStats.avg);
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, avgY);
            ctx.lineTo(xAxis.right, avgY);
            ctx.stroke();

            // Target 1200ms — yellow dashed
            const targetY = yAxis.getPixelForValue(1200);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, targetY);
            ctx.lineTo(xAxis.right, targetY);
            ctx.stroke();

            // Assistant Max — red dashed
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

        return new Chart(canvas, {
          type: 'bar',
          plugins: [refLinePlugin],
          data: {
            labels,
            datasets: [
              {
                label: 'LLM Latency',
                data: llmData,
                backgroundColor: llmColors,
                borderWidth: 0,
                barPercentage: 0.6,
                categoryPercentage: 0.8,
                stack: 'bars',
              },
              {
                label: 'Utterance Processing',
                data: utteranceData,
                backgroundColor: utteranceColors,
                borderWidth: 0,
                barPercentage: 0.6,
                categoryPercentage: 0.8,
                stack: 'bars',
              },
              {
                label: 'Audio Delivery',
                data: audioData,
                backgroundColor: audioColors,
                borderWidth: 0,
                barPercentage: 0.6,
                categoryPercentage: 0.8,
                stack: 'bars',
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
                labels: {
                  color: '#9ca3af',
                  usePointStyle: false,
                  boxWidth: 15,
                  padding: 12,
                  font: { size: 11 },
                  generateLabels: (chart) => {
                    const base = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                    // Add reference line legends
                    base.push(
                      {
                        text: 'Asst Avg (excl. tools)',
                        fillStyle: 'transparent',
                        strokeStyle: 'rgba(34, 197, 94, 0.8)',
                        lineWidth: 2,
                        lineDash: [5, 5],
                        hidden: false,
                        index: 100,
                      },
                      {
                        text: 'Target (1200ms)',
                        fillStyle: 'transparent',
                        strokeStyle: 'rgba(251, 191, 36, 0.8)',
                        lineWidth: 2,
                        lineDash: [10, 5],
                        hidden: false,
                        index: 101,
                      },
                      {
                        text: 'Asst Max (excl. tools)',
                        fillStyle: 'transparent',
                        strokeStyle: 'rgba(239, 68, 68, 0.8)',
                        lineWidth: 2,
                        lineDash: [3, 3],
                        hidden: false,
                        index: 102,
                      }
                    );
                    return base;
                  },
                },
              },
              tooltip: {
                ...TOOLTIP_STYLE,
                callbacks: {
                  title: (items) => {
                    const idx = items[0].dataIndex;
                    const r = breakdown[idx];
                    return r.role === 'tool' ? `Tool Call ${idx + 1}` : `Turn ${idx + 1}`;
                  },
                  label: (ctx) => {
                    const val = ctx.parsed.y || 0;
                    if (val > 0) return `${ctx.dataset.label}: ${val}ms`;
                    return '';
                  },
                  afterBody: (items) => {
                    const idx = items[0].dataIndex;
                    const r = breakdown[idx];
                    return [`Total: ${r.total}ms`];
                  },
                },
              },
            },
            scales: {
              x: {
                stacked: true,
                ...SCALE_STYLE.x,
                title: { display: true, text: 'Responses', color: '#6b7280' },
              },
              y: {
                stacked: true,
                ...SCALE_STYLE.y,
                beginAtZero: true,
                title: { display: true, text: 'Latency (ms)', color: '#6b7280' },
              },
            },
          },
        });
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
        const labels = msgs.map((m, i) => m.isBargeIn ? `Msg ${i + 1} *` : `Msg ${i + 1}`);

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
          assistant: COLORS.blue,
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
              borderColor: '#1a1d27',
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

  // ─── 5. SWAIG Execution vs Function Latency ───
  const toolNames = Object.keys(t.toolBreakdown).filter(
    n => t.toolBreakdown[n].executionLatencies.length > 0 || t.toolBreakdown[n].functionLatencies.length > 0
  );
  if (toolNames.length > 0) {
    chartDefs.push({
      title: 'SWAIG Latency by Command',
      id: 'chart-swaig',
      render: (canvas) => {
        const avgExec = toolNames.map(name => {
          const lats = t.toolBreakdown[name].executionLatencies;
          return lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
        });
        const avgFunc = toolNames.map(name => {
          const lats = t.toolBreakdown[name].functionLatencies;
          return lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
        });
        return new Chart(canvas, {
          type: 'bar',
          data: {
            labels: toolNames,
            datasets: [
              {
                label: 'Execution (round-trip)',
                data: avgExec,
                backgroundColor: 'rgba(245,158,11,0.6)',
                borderColor: COLORS.yellow,
                borderWidth: 1,
                borderRadius: 4,
              },
              {
                label: 'Function (remote only)',
                data: avgFunc,
                backgroundColor: 'rgba(239,68,68,0.5)',
                borderColor: COLORS.red,
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
        ${chartDefs.map(cd => `
          <div class="chart-card${cd.id === 'chart-latency-breakdown' ? ' chart-card--wide' : ''}">
            <div class="chart-card__title">${cd.title}</div>
            <div style="position:relative;height:${cd.id === 'chart-latency-breakdown' ? '320' : '260'}px;">
              <canvas id="${cd.id}"></canvas>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  for (const cd of chartDefs) {
    const canvas = document.getElementById(cd.id);
    if (canvas) {
      const chart = cd.render(canvas);
      if (chart) activeCharts.push(chart);
    }
  }
}
