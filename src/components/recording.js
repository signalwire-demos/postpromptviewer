import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import MinimapPlugin from 'wavesurfer.js/dist/plugins/minimap.esm.js';
import HoverPlugin from 'wavesurfer.js/dist/plugins/hover.esm.js';
import { truncate } from '../../lib/utils.js';

const REGION_COLORS = {
  user: 'rgba(16, 185, 129, 0.12)',
  endpointing: 'rgba(16, 185, 129, 0.06)',
  assistant: 'rgba(59, 130, 246, 0.12)',
  'assistant-manual': 'rgba(236, 72, 153, 0.12)',
  tool: 'rgba(245, 158, 11, 0.12)',
  'assistant-thinking': 'rgba(168, 85, 247, 0.12)',
  calling: 'rgba(251, 146, 60, 0.12)',
  step: 'rgba(148, 163, 184, 0.12)',
};

function classifySystemLog(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (trimmed.startsWith('Thinking:')) return 'assistant-thinking';
  if (trimmed.startsWith('Calling function:')) return 'calling';
  if (trimmed.startsWith('Steps function:')) return 'step';
  return null;
}

/**
 * Scan an audio channel for the first window of sustained energy above the
 * noise floor.  Returns the time in seconds, or null if nothing found.
 */
function findFirstAudioSec(buffer, channelIndex) {
  if (!buffer || channelIndex >= buffer.numberOfChannels) return null;
  const data = buffer.getChannelData(channelIndex);
  const rate = buffer.sampleRate;
  const windowSize = Math.round(rate * 0.02); // 20ms windows
  const threshold = 0.0004; // RMS² threshold (~-34 dBFS)
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += data[i + j] * data[i + j];
    }
    if (energy / windowSize > threshold) {
      return i / rate;
    }
  }
  return null;
}

let wavesurfer = null;
let _spaceHandler = null;

/**
 * Build call-log regions mapped to audio-relative seconds.
 * Uses recordingDuration to auto-select the best anchor timestamp and
 * apply a scale factor so regions align with the actual audio.
 */
function buildRegions(payload, recordingDuration, firstBotAudioSec) {
  let bestAnchor, scale;

  if (payload.recordCallStart) {
    // Exact recording start timestamp from SWMLVars – best possible anchor.
    bestAnchor = payload.recordCallStart;
    const endRef = payload.callEndDate || payload.aiEndDate;
    if (endRef) {
      const expectedDuration = (endRef - payload.recordCallStart) / 1_000_000;
      scale = expectedDuration > 0 ? recordingDuration / expectedDuration : 1;
    } else {
      scale = 1;
    }
  } else if (payload.aiStartDate && firstBotAudioSec != null) {
    // No record_call_start – calibrate from the waveform.  Align the first
    // speaking event's start_timestamp to where audio actually begins in the
    // decoded buffer.  scale=1 because timestamps are wall-clock.
    const firstSpeaker = payload.callLog.find(m =>
      (m.role === 'assistant' || m.role === 'assistant-manual') && m.start_timestamp && m.content);
    if (firstSpeaker) {
      bestAnchor = firstSpeaker.start_timestamp - Math.round(firstBotAudioSec * 1_000_000);
      scale = 1;
    }
  }

  if (bestAnchor == null && payload.aiStartDate) {
    // Per spec: use ai_start_date as anchor, not call_answer_date.
    bestAnchor = payload.aiStartDate;
    // Don't apply scale factor without recordCallStart - trust the timestamps
    // Scaling without a precise recording start introduces more error than it fixes
    scale = 1;
  }

  if (bestAnchor == null) {
    // Legacy fallback: best-fit from available call-level timestamps.
    const callEnd = payload.callEndDate || payload.aiEndDate;
    const candidates = [
      payload.callStartDate,
      payload.callAnswerDate,
      payload.aiStartDate,
    ].filter(Boolean);

    bestAnchor = payload.callStartDate;
    let bestDiff = Infinity;
    for (const anchor of candidates) {
      const span = (callEnd - anchor) / 1_000_000;
      const diff = Math.abs(span - recordingDuration);
      if (diff < bestDiff) { bestDiff = diff; bestAnchor = anchor; }
    }

    // Use scale=1 to trust timestamps rather than introducing drift
    scale = 1;
  }

  // Helper: convert microsecond timestamp to audio-relative seconds
  const toSec = (us) => ((us - bestAnchor) / 1_000_000) * scale;

  console.log('Recording alignment debug:', {
    bestAnchor,
    scale,
    recordingDuration,
    firstBotAudioSec,
    hasRecordCallStart: !!payload.recordCallStart,
  });

  const regions = [];

  // Index callLog for next-timestamp lookups (system-log duration)
  const allMessages = payload.callLog.filter(m => m.timestamp || m.start_timestamp).sort((a, b) => (a.start_timestamp || a.timestamp) - (b.start_timestamp || b.timestamp));

  for (let mi = 0; mi < allMessages.length; mi++) {
    const msg = allMessages[mi];
    const role = msg.role;

    // Handle system-log entries (thinking, step)
    // "Calling function:" is merged into the tool region instead.
    if (role === 'system-log') {
      const category = classifySystemLog(msg.content);
      if (!category || category === 'calling' || category === 'step') continue;
      const startSec = toSec(msg.timestamp);
      if (startSec < 0) continue;
      // Duration: time until next message
      let nextTs = msg.timestamp + 1_000_000; // 1s default
      for (let j = mi + 1; j < allMessages.length; j++) {
        nextTs = allMessages[j].timestamp;
        break;
      }
      let durSec = ((nextTs - msg.timestamp) / 1_000_000) * scale;
      if (durSec < 0.02) continue;
      const displayContent = msg.content.trim()
        .replace(/^Thinking:\s*/, '')
        .replace(/^Steps function:\s*/, '');
      regions.push({
        start: Math.max(0, startSec),
        end: startSec + durSec,
        color: REGION_COLORS[category],
        role: category,
        content: truncate(displayContent, 40),
        fullContent: displayContent,
      });
      continue;
    }

    if (!REGION_COLORS[role]) continue;

    if (role === 'user') {
      if (!msg.start_timestamp || !msg.end_timestamp) continue;
      const startSec = toSec(msg.start_timestamp);
      const endSec = toSec(msg.end_timestamp);
      if (endSec < 0) continue;
      regions.push({
        start: Math.max(0, startSec),
        end: endSec,
        color: REGION_COLORS.user,
        role: 'user',
        content: truncate(msg.content || '', 40),
        fullContent: msg.content || '',
      });
      // Mark the exact moment endpointing fired as a thin bright line.
      const turnMs = msg.speaking_to_turn_detection || 0;
      if (turnMs) {
        const turnSec = toSec(msg.start_timestamp + turnMs * 1000);
        if (turnSec > 0 && turnSec < endSec) {
          const sliver = 0.04; // ~40ms wide – renders as a thin line
          regions.push({
            start: turnSec,
            end: turnSec + sliver,
            color: 'rgba(250, 204, 21, 0.7)',
            role: 'endpointing',
            content: 'EP',
            fullContent: `Endpointing (${turnMs}ms) → ASR final +${msg.turn_detection_to_final_event || 0}ms`,
          });
        }
      }
    } else if (role === 'assistant') {
      if (msg.tool_calls && !msg.content) continue;
      if (!msg.start_timestamp || !msg.end_timestamp) continue;
      const startSec = toSec(msg.start_timestamp);
      const endSec = toSec(msg.end_timestamp);
      if (endSec <= 0) continue; // Only skip if region ends before recording starts
      regions.push({
        start: Math.max(0, startSec),
        end: endSec,
        color: REGION_COLORS.assistant,
        role: 'assistant',
        content: truncate(msg.content || '', 40),
        fullContent: msg.content || '',
      });
    } else if (role === 'tool') {
      if (!msg.start_timestamp || !msg.end_timestamp) continue;
      const startSec = toSec(msg.start_timestamp);
      const endSec = toSec(msg.end_timestamp);
      if (startSec < 0 && endSec < 0) continue;
      regions.push({
        start: Math.max(0, startSec),
        end: endSec,
        color: REGION_COLORS.tool,
        role: 'tool',
        content: 'Tool',
        fullContent: msg.content || 'Tool call',
      });
    } else if (role === 'assistant-manual') {
      if (!msg.start_timestamp || !msg.end_timestamp) continue;
      const startSec = toSec(msg.start_timestamp);
      const endSec = toSec(msg.end_timestamp);
      if (endSec < 0) continue;
      regions.push({
        start: Math.max(0, startSec),
        end: endSec,
        color: REGION_COLORS['assistant-manual'],
        role: 'assistant-manual',
        content: truncate(msg.content || '', 40),
        fullContent: msg.content || '',
      });
    }
  }

  // Detect overlaps and create red overlay regions instead of clipping
  regions.sort((a, b) => a.start - b.start);
  const overlaps = [];
  for (let i = 0; i < regions.length; i++) {
    const a = regions[i];
    for (let j = i + 1; j < regions.length; j++) {
      const b = regions[j];
      if (b.start >= a.end) break;
      // Skip overlaps between related roles (e.g. thinking overlaps assistant)
      if (a.role === b.role) continue;
      if (a.role === 'assistant-thinking' || b.role === 'assistant-thinking') continue;
      if (a.role === 'step' || b.role === 'step') continue;
      if (a.role === 'endpointing' || b.role === 'endpointing') continue;
      if ((a.role === 'assistant-manual' && b.role === 'tool') || (a.role === 'tool' && b.role === 'assistant-manual')) continue;
      overlaps.push({
        start: b.start,
        end: Math.min(a.end, b.end),
        color: 'rgba(239, 68, 68, 0.25)',
        role: 'overlap',
        content: 'Overlap',
        fullContent: `${a.role} / ${b.role} overlap`,
      });
    }
  }
  regions.push(...overlaps);

  return regions;
}


function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function destroyWavesurfer() {
  if (wavesurfer) {
    wavesurfer.destroy();
    wavesurfer = null;
  }
}

export function renderRecording(container, payload) {
  destroyWavesurfer();

  const url = payload.recordCallUrl;

  if (!url) {
    container.innerHTML = `
      <div class="recording">
        <div class="recording__empty">
          <p>No recording available for this call.</p>
          <p class="recording__empty-hint">Recordings appear when <code>record_call_url</code> is present in SWMLVars.</p>
        </div>
      </div>
    `;
    return;
  }

  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);

  container.innerHTML = `
    <div class="recording">
      <div class="recording__video-container">
        <video class="recording__video" id="recording-video" playsinline ${isVideo ? '' : 'style="display:none"'}></video>
      </div>

      <div class="recording__controls">
        <button class="recording__btn recording__play" title="Play / Pause">
          <span class="recording__play-icon">&#9654;</span>
        </button>
        <span class="recording__time">
          <span class="recording__current">0:00</span>
          <span class="recording__separator">/</span>
          <span class="recording__duration">--:--</span>
        </span>
        <div class="recording__volume">
          <label class="recording__volume-label" title="Volume">&#128266;</label>
          <input type="range" class="recording__volume-slider" min="0" max="1" step="0.05" value="0.8" />
        </div>
        <div class="recording__speed">
          <button class="recording__speed-btn" data-speed="0.5">0.5x</button>
          <button class="recording__speed-btn active" data-speed="1">1x</button>
          <button class="recording__speed-btn" data-speed="1.5">1.5x</button>
          <button class="recording__speed-btn" data-speed="2">2x</button>
        </div>
        <div class="recording__zoom">
          <label class="recording__zoom-label" title="Zoom">&#128269;</label>
          <input type="range" class="recording__zoom-slider" min="0" max="500" step="1" value="0" />
        </div>
        <a class="recording__download" href="${url}" target="_blank" title="Download">&#11015;</a>
      </div>

      <div class="recording__minimap" id="waveform-minimap"></div>
      <div class="recording__waveform" id="waveform"></div>
      <div class="recording__timeline-axis" id="waveform-timeline"></div>

      <div class="recording__legend">
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.user}; border:1px solid rgba(16,185,129,0.6)"></span> User</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:rgba(250,204,21,0.7); border:1px solid rgba(250,204,21,0.9)"></span> Endpointing</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.assistant}; border:1px solid rgba(59,130,246,0.6)"></span> Assistant</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.tool}; border:1px solid rgba(245,158,11,0.6)"></span> Tool Call</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS['assistant-thinking']}; border:1px solid rgba(168,85,247,0.6)"></span> Thinking</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS['assistant-manual']}; border:1px solid rgba(236,72,153,0.6)"></span> Manual Say</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.step}; border:1px solid rgba(148,163,184,0.6)"></span> Step</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:rgba(239, 68, 68, 0.25); border:1px solid rgba(239,68,68,0.6)"></span> Barge-in</span>
      </div>

      <div class="recording__transcript" id="recording-transcript">
        <span class="recording__transcript-role"></span>
        <span class="recording__transcript-text"></span>
      </div>

      <div class="recording__status" id="recording-status">Loading recording...</div>
    </div>
  `;

  const regions = RegionsPlugin.create();

  const isOutbound = payload.direction === 'outbound';

  const opts = {
    container: '#waveform',
    cursorColor: '#e4e6eb',
    cursorWidth: 1,
    height: 250,
    autoScroll: true,
    normalize: true,
    splitChannels: [
      { waveColor: 'rgba(16, 185, 129, 0.5)', progressColor: 'rgba(16, 185, 129, 0.8)' },
      { waveColor: 'rgba(59, 130, 246, 0.5)', progressColor: 'rgba(59, 130, 246, 0.8)' },
    ],
    plugins: [
      regions,
      TimelinePlugin.create({
        container: '#waveform-timeline',
        height: 20,
        timeInterval: 5,
        primaryLabelInterval: 10,
        style: {
          color: 'var(--text-secondary)',
          fontSize: '11px',
        },
      }),
      MinimapPlugin.create({
        height: 30,
        waveColor: 'rgba(148, 163, 184, 0.4)',
        progressColor: 'rgba(148, 163, 184, 0.7)',
        cursorColor: '#e4e6eb',
        container: '#waveform-minimap',
      }),
      HoverPlugin.create({
        lineColor: 'rgba(255, 255, 255, 0.5)',
        lineWidth: 1,
        labelBackground: 'rgba(0, 0, 0, 0.75)',
        labelColor: '#fff',
        labelSize: '11px',
        formatTimeCallback: (sec) => `${(sec * 1000).toFixed(0)}ms`,
      }),
    ],
  };

  // For video URLs, use a <video> element as the media source so wavesurfer
  // renders the waveform from its audio track and both stay synced.
  if (isVideo) {
    const videoEl = container.querySelector('#recording-video');
    videoEl.src = url;
    videoEl.crossOrigin = 'anonymous';
    videoEl.load();
    opts.media = videoEl;
  } else {
    opts.url = url;
  }

  wavesurfer = WaveSurfer.create(opts);

  const statusEl = container.querySelector('#recording-status');
  const playBtn = container.querySelector('.recording__play');
  const playIcon = container.querySelector('.recording__play-icon');
  const currentEl = container.querySelector('.recording__current');
  const durationEl = container.querySelector('.recording__duration');
  const volumeSlider = container.querySelector('.recording__volume-slider');
  const zoomSlider = container.querySelector('.recording__zoom-slider');
  const speedBtns = container.querySelectorAll('.recording__speed-btn');

  wavesurfer.on('loading', (pct) => {
    statusEl.textContent = `Loading recording... ${pct}%`;
    statusEl.style.display = '';
    statusEl.style.color = '';
  });

  wavesurfer.on('decode', () => {
    statusEl.textContent = 'Decoding...';
    // For outbound calls, swap channel data so user is always on top
    if (isOutbound) {
      const buffer = wavesurfer.getDecodedData();
      if (buffer && buffer.numberOfChannels >= 2) {
        const ch0Copy = new Float32Array(buffer.getChannelData(0));
        buffer.getChannelData(0).set(buffer.getChannelData(1));
        buffer.getChannelData(1).set(ch0Copy);
      }
    }
  });

  wavesurfer.on('ready', () => {
    statusEl.style.display = 'none';
    durationEl.textContent = formatTime(wavesurfer.getDuration());

    // Detect first bot audio for waveform-based anchor calibration.
    // After the decode channel swap, bot is always channel 1 (stereo) or 0 (mono).
    const buf = wavesurfer.getDecodedData();
    const botCh = buf && buf.numberOfChannels >= 2 ? 1 : 0;
    const firstBotAudioSec = findFirstAudioSec(buf, botCh);

    const callRegions = buildRegions(payload, wavesurfer.getDuration(), firstBotAudioSec);
    const dur = wavesurfer.getDuration();
    for (const r of callRegions) {
      const region = regions.addRegion({
        start: r.start,
        end: Math.min(r.end, dur),
        color: r.color,
        drag: false,
        resize: false,
      });
      // Stash metadata for export and transcript display
      region._original = { start: r.start, end: Math.min(r.end, dur), role: r.role, content: r.content };
      region._meta = { role: r.role, fullContent: r.fullContent };
    }
  });

  wavesurfer.on('error', (err) => {
    statusEl.textContent = `Failed to load: ${err}`;
    statusEl.style.color = 'var(--danger)';
    statusEl.style.display = '';
  });

  const transcriptEl = container.querySelector('#recording-transcript');
  const transcriptRole = transcriptEl.querySelector('.recording__transcript-role');
  const transcriptText = transcriptEl.querySelector('.recording__transcript-text');
  let lastTranscriptId = null;

  const ROLE_LABELS = { user: 'User', endpointing: 'Endpointing', assistant: 'Assistant', 'assistant-manual': 'Manual Say', tool: 'Tool', 'assistant-thinking': 'Thinking', step: 'Step', overlap: 'Barge-in' };

  const ROLE_PRIORITY = { user: 3, 'assistant-manual': 2, endpointing: 1, tool: 1, 'assistant-thinking': 1, step: 0, assistant: 0 };

  wavesurfer.on('timeupdate', (time) => {
    currentEl.textContent = formatTime(time);

    // Find all active regions; during barge-in prefer user over assistant
    const hits = regions.getRegions().filter(r => time >= r.start && time <= r.end && r._meta);
    hits.sort((a, b) => (ROLE_PRIORITY[b._meta.role] || 0) - (ROLE_PRIORITY[a._meta.role] || 0));
    const active = hits[0] || null;
    const id = active?.id || null;
    if (id !== lastTranscriptId) {
      lastTranscriptId = id;
      if (active) {
        const role = active._meta.role;
        transcriptRole.textContent = ROLE_LABELS[role] || role;
        transcriptRole.className = 'recording__transcript-role recording__transcript-role--' + role;
        transcriptText.textContent = active._meta.fullContent;
        transcriptEl.classList.add('recording__transcript--active');
      } else {
        transcriptRole.textContent = '';
        transcriptText.textContent = '';
        transcriptEl.classList.remove('recording__transcript--active');
      }
    }
  });

  wavesurfer.on('play', () => { playIcon.innerHTML = '&#9646;&#9646;'; });
  wavesurfer.on('pause', () => { playIcon.innerHTML = '&#9654;'; });

  playBtn.addEventListener('click', () => wavesurfer.playPause());

  if (_spaceHandler) document.removeEventListener('keydown', _spaceHandler);
  _spaceHandler = (e) => {
    if (e.code === 'Space' && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      wavesurfer?.playPause();
    }
  };
  document.addEventListener('keydown', _spaceHandler);

  volumeSlider.addEventListener('input', (e) => {
    wavesurfer.setVolume(parseFloat(e.target.value));
  });
  wavesurfer.setVolume(0.8);

  // Restore saved playback speed (UI immediately, rate on ready)
  const savedSpeed = localStorage.getItem('recording_speed');
  if (savedSpeed) {
    const speed = parseFloat(savedSpeed);
    speedBtns.forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === speed);
    });
    wavesurfer.on('ready', () => {
      wavesurfer.setPlaybackRate(speed);
    });
  }

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      wavesurfer.setPlaybackRate(speed);
      localStorage.setItem('recording_speed', speed);
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Zoom: slider value is additional pixels-per-second beyond the default
  zoomSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    wavesurfer.zoom(val || 0);
  });

}
