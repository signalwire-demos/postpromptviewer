import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { truncate } from '../../lib/utils.js';

const REGION_COLORS = {
  user: 'rgba(16, 185, 129, 0.25)',
  assistant: 'rgba(59, 130, 246, 0.25)',
  tool: 'rgba(245, 158, 11, 0.25)',
};

let wavesurfer = null;

/**
 * Build call-log regions mapped to audio-relative seconds.
 */
function buildRegions(payload) {
  const anchorUs = payload.callAnswerDate || payload.callStartDate;
  const regions = [];

  for (const msg of payload.callLog) {
    if (!msg.timestamp) continue;
    const role = msg.role;
    if (!REGION_COLORS[role]) continue;

    const startSec = (msg.timestamp - anchorUs) / 1_000_000;
    if (startSec < 0) continue;

    if (role === 'user') {
      const dur = (msg.speaking_to_final_event || 500) / 1000;
      regions.push({
        start: Math.max(0, startSec - dur),
        end: startSec,
        color: REGION_COLORS.user,
        content: truncate(msg.content || '', 40),
      });
    } else if (role === 'assistant') {
      if (msg.tool_calls && !msg.content) continue;
      if (!msg.audio_latency && !msg.utterance_latency && !msg.latency) continue;
      const words = (msg.content || '').split(/\s+/).length;
      const speakSec = Math.max(words / 3, 1);
      regions.push({
        start: startSec,
        end: startSec + speakSec,
        color: REGION_COLORS.assistant,
        content: truncate(msg.content || '', 40),
      });
    } else if (role === 'tool') {
      const execSec = (msg.execution_latency || 300) / 1000;
      regions.push({
        start: startSec,
        end: startSec + execSec,
        color: REGION_COLORS.tool,
        content: 'Tool',
      });
    }
  }

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
      ${isVideo ? `
        <div class="recording__video-container">
          <video class="recording__video" id="recording-video" playsinline></video>
        </div>
      ` : ''}

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
        <a class="recording__download" href="${url}" target="_blank" title="Download">&#11015;</a>
      </div>

      <div class="recording__waveform" id="waveform"></div>
      <div class="recording__timeline-axis" id="waveform-timeline"></div>

      <div class="recording__legend">
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.user}; border:1px solid rgba(16,185,129,0.6)"></span> User</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.assistant}; border:1px solid rgba(59,130,246,0.6)"></span> Assistant</span>
        <span class="recording__legend-item"><span class="recording__swatch" style="background:${REGION_COLORS.tool}; border:1px solid rgba(245,158,11,0.6)"></span> Tool Call</span>
      </div>

      <div class="recording__status" id="recording-status">Loading recording...</div>
    </div>
  `;

  const regions = RegionsPlugin.create();

  const opts = {
    container: '#waveform',
    cursorColor: '#e4e6eb',
    cursorWidth: 1,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 128,
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
  const speedBtns = container.querySelectorAll('.recording__speed-btn');

  wavesurfer.on('loading', (pct) => {
    statusEl.textContent = `Loading recording... ${pct}%`;
    statusEl.style.display = '';
    statusEl.style.color = '';
  });

  wavesurfer.on('decode', () => {
    statusEl.textContent = 'Decoding...';
  });

  wavesurfer.on('ready', () => {
    statusEl.style.display = 'none';
    durationEl.textContent = formatTime(wavesurfer.getDuration());

    const callRegions = buildRegions(payload);
    const dur = wavesurfer.getDuration();
    for (const r of callRegions) {
      regions.addRegion({
        start: r.start,
        end: Math.min(r.end, dur),
        color: r.color,
        content: r.content,
        drag: false,
        resize: false,
      });
    }
  });

  wavesurfer.on('error', (err) => {
    statusEl.textContent = `Failed to load: ${err}`;
    statusEl.style.color = 'var(--danger)';
    statusEl.style.display = '';
  });

  wavesurfer.on('timeupdate', (time) => {
    currentEl.textContent = formatTime(time);
  });

  wavesurfer.on('play', () => { playIcon.innerHTML = '&#9646;&#9646;'; });
  wavesurfer.on('pause', () => { playIcon.innerHTML = '&#9654;'; });

  playBtn.addEventListener('click', () => wavesurfer.playPause());

  volumeSlider.addEventListener('input', (e) => {
    wavesurfer.setVolume(parseFloat(e.target.value));
  });
  wavesurfer.setVolume(0.8);

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      wavesurfer.setPlaybackRate(speed);
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}
