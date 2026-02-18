# Post-Prompt Observability Viewer

A single-page application for visualizing SignalWire AI Agent post-conversation webhook payloads and SWML configuration files. Upload a JSON payload from a completed call and instantly see performance metrics, conversation flow, tool usage, latency analysis, and full call recordings with stereo waveform visualization. Also supports SWML inspection with interactive state diagrams and prompt analysis.

Built with **Vanilla JS**, **Vite**, **Chart.js**, **Mermaid**, and **wavesurfer.js** — no framework dependencies.

<div align="center">

https://github.com/user-attachments/assets/ui-walkthrough.webm

*Full UI walkthrough — every tab from a live GoAir demo call*

</div>

## Agent Builder

The project now includes a **visual drag-and-drop agent builder** for creating SignalWire AI agents!

- **Location**: `/ui` directory
- **Dev Server**: `http://localhost:5177` (when running)
- **Features**: Visual canvas, step/function nodes, SWML export, Python SDK code generation

See [`ui/README.md`](ui/README.md) for full documentation.

## Screenshots

### Drop Zone (Start Screen)
Dual upload interface supporting both Post-Prompt conversation files and SWML configuration files. Features drag-and-drop, file browsing, instant example loading, and GitHub repository link.

<img src="images/01-drop-zone.png" alt="Drop Zone — file upload interface with example loading" width="800" />

### Dashboard
KPI metric cards covering call duration, response latency (assistant and tool), system performance rating, conversation stats, token usage, SWAIG details, and media/billing summaries.

<img src="images/02-dashboard.png" alt="Dashboard — KPI metrics overview" width="800" />

### Charts
Six interactive Chart.js visualizations: dual latency breakdown charts (assistant responses and tool calls), tokens per second, ASR confidence per utterance, speech detection timing, message role breakdown donut, and SWAIG latency by command.

<img src="images/03-charts.png" alt="Charts — latency, TPS, ASR, and role breakdown" width="800" />

### Timeline
Horizontal swimlane view of the full call lifecycle. The top bar shows call phases (ring, setup, AI session, teardown). Below, a conversation flow chart maps every user, assistant, tool, say, and system message to its real timestamp.

<img src="images/04-timeline.png" alt="Timeline — call phases and conversation flow swimlane" width="800" />

### Transcript (Processed Log)
Scrollable conversation log with role-colored message bubbles (system, assistant, tool, user). Each message includes expandable metadata badges for latency, audio timing, ASR confidence, and timestamps. Includes response time rating badges (Excellent, Good, Fair, Needs Improvement) and filters for finding slow responses.

<img src="images/05-transcript.png" alt="Transcript — role-colored conversation with metadata" width="800" />

### Transcript (Raw Call Log)
Unprocessed call log showing every raw entry including system-log events, step changes, function calls, gather answers, and session lifecycle markers. Toggle between Processed and Raw views.

<img src="images/06-raw-call-log.png" alt="Raw Call Log — unprocessed system events and call entries" width="800" />

### SWAIG Inspector
Expandable accordion of every SWAIG function call made during the session. Each entry shows the full `post_data` request and `post_response` as formatted JSON with search functionality that auto-expands nested items and filters to matching fields only.

<img src="images/07-swaig-inspector.png" alt="SWAIG Inspector — function call request/response details" width="800" />

### Post-Prompt
Displays the post-prompt execution result with Raw and Substituted sub-tabs. Shows what the AI agent executed after the conversation ended (e.g., summary functions, data extraction).

<img src="images/08-post-prompt.png" alt="Post-Prompt — post-conversation function results" width="800" />

### State Flow
Interactive Mermaid diagram visualizing the actual conversation flow as a state machine. Shows step transitions, function calls, SWAIG actions (set_global_data, change_step, transfer, hangup, etc.), gather Q&A, and navigation edges. Includes zoom/pan, Mermaid/SVG copy, and PNG export with legend.

<img src="images/09-state-flow.png" alt="State Flow — conversation state machine diagram with actions" width="800" />

### Recording
Stereo waveform visualization powered by wavesurfer.js with color-coded overlay regions (user speech, endpointing, assistant, tool calls, thinking, manual say, barge-in). Includes synced video playback, speed controls, and a scrubbing cursor that displays the matching transcript line.

<img src="images/10-recording.png" alt="Recording — stereo waveform with overlay regions and video" width="800" />

### Global Data (Snapshot)
Expandable JSON view of session state at end of call, including `global_data` (set by SWAIG `set_global_data` actions), `SWMLVars` (runtime call variables), and `SWMLCall` signaling-layer metadata. Includes search with auto-expand and field-level filtering.

<img src="images/11-global-data-snapshot.png" alt="Global Data Snapshot — session state and call metadata JSON" width="800" />

### Global Data (Timeline)
Animated timeline player showing every `set_global_data` mutation over the call timeline. Watch keys being added (green), updated (red), and removed (fade out) in real time. Includes playback controls with 1x/2x/3x speed, event list sidebar with mutation badges, and a seekable progress bar.

<img src="images/12-global-data-timeline.png" alt="Global Data Timeline — animated mutation player" width="800" />

### SWML Overview
Inspector for SignalWire Markup Language (SWML) configuration files. Overview tab shows general configuration, sections, and high-level structure.

<img src="images/13-swml-overview.png" alt="SWML Overview — configuration summary" width="800" />

### SWML Prompts & Steps
Detailed view of SWML prompts and steps with interactive Mermaid state diagrams. Supports both text and bullet-point prompt formats with PNG export for diagrams.

<img src="images/14-swml-prompts.png" alt="SWML Prompts — prompts and state flow visualization" width="800" />

### SWML Functions
Expandable list of all SWML functions with their parameters, purposes, and metadata arguments.

<img src="images/15-swml-functions.png" alt="SWML Functions — function definitions and parameters" width="800" />

### SWML Configuration
Raw JSON view of SWML configuration including parameters, hints, language settings, and other top-level configuration options.

<img src="images/16-swml-config.png" alt="SWML Configuration — raw configuration JSON" width="800" />

## What This Does

When a SignalWire AI Agent call completes, the platform emits a `post_conversation` webhook payload containing everything that happened during the call: the full conversation log, SWAIG function calls, ASR confidence scores, token usage, latency measurements, and more.

This viewer parses that payload and presents it across interactive tabs:

| Tab | What It Shows |
|-----|---------------|
| **Dashboard** | 16 KPI metric cards — call duration, response latency, token usage, ASR confidence, barge-in rate, SWAIG call count, TPS stats |
| **Charts** | 6 Chart.js visualizations — response latency over time, tokens per second, ASR confidence distribution, message role breakdown, SWAIG execution latency, call timeline phases |
| **Timeline** | Horizontal swimlane showing the full call lifecycle — user speech, assistant responses, tool calls, thinking, manual says, all mapped to real timestamps |
| **Transcript** | Scrollable conversation with role-colored message bubbles, expandable metadata (latency, confidence, tool results), response time rating badges, toggle between processed and raw call log |
| **SWAIG Inspector** | Accordion list of every SWAIG function call with full `post_data` and `post_response` as formatted JSON, search with auto-expand and field-level filtering |
| **Post-Prompt** | Tabbed view of raw, substituted, and parsed post-prompt data |
| **State Flow** | Interactive Mermaid diagram of actual state transitions, function calls, SWAIG actions (navigation, terminal, data), gather Q&A — with zoom/pan and PNG export |
| **Recording** | Stereo waveform visualization with call-log regions overlaid, synced video playback for MP4 recordings, playback controls with speed adjustment |
| **Global Data** | Snapshot view of final session state + animated timeline player showing every `set_global_data` mutation with playback controls |

Additionally, the viewer supports **SWML Inspector** mode for analyzing SignalWire Markup Language configuration files with four dedicated tabs:

| SWML Tab | What It Shows |
|----------|---------------|
| **Overview** | General configuration summary, sections, and high-level structure |
| **Prompts & Steps** | Interactive Mermaid state diagrams showing prompt flow with PNG export |
| **Functions** | Expandable list of all functions with parameters and metadata |
| **Configuration** | Raw JSON view of all SWML configuration options |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/signalwire-demos/postpromptviewer.git
cd postpromptviewer

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open the URL shown in the terminal (default: `http://localhost:5173`), then either:
- Click **"Load Example"** to instantly try the app with sample data
- Drag and drop your own post-conversation JSON file
- Click **"Browse Files"** to select a file from your computer

## Building for Production

```bash
npm run build
```

The output goes to `dist/` — a static bundle you can serve from any web server, S3 bucket, or CDN. No backend required.

```bash
# Preview the production build locally
npm run preview
```

## Project Structure

```
├── lib/                        # Standalone library (zero DOM dependencies)
│   ├── index.js                # Public API: parsePayload, computeMetrics
│   ├── parser.js               # Validates + normalizes raw JSON payload
│   ├── utils.js                # Shared helpers (epoch→Date, stats, formatting)
│   └── metrics/
│       ├── duration.js         # Call/AI/ring durations from timestamps
│       ├── latency.js          # Assistant response latency (min/max/avg/p95)
│       ├── asr.js              # ASR confidence stats, barge-in rate
│       ├── conversation.js     # Turn count, messages by role, word counts
│       ├── tools.js            # SWAIG call count, execution latency, action types
│       └── tokens.js           # Token totals, TPS stats from times[]
├── src/                        # Viewer SPA
│   ├── main.js                 # App entry: mounts components, wires tab navigation
│   ├── state.js                # Pub/sub store for payload, metrics, UI state
│   ├── components/
│   │   ├── drop-zone.js        # Drag-and-drop + file picker + example loader
│   │   ├── header.js           # Call ID, timestamps, duration badge, caller info
│   │   ├── dashboard.js        # 4x4 grid of metric cards
│   │   ├── charts.js           # 6 Chart.js visualizations
│   │   ├── timeline.js         # Horizontal swimlane: call lifecycle phases
│   │   ├── transcript.js       # Role-colored conversation bubbles + raw log toggle
│   │   ├── swaig-inspector.js  # Expandable SWAIG log with formatted JSON
│   │   ├── post-prompt.js      # Post-prompt summary (raw/substituted/parsed)
│   │   ├── state-flow.js       # Mermaid state diagram with actions + PNG export
│   │   ├── recording.js        # Stereo waveform + video playback via wavesurfer.js
│   │   └── global-data.js      # Snapshot view + animated timeline mutation player
│   └── styles/
│       ├── theme.css           # Dark theme, CSS custom properties
│       └── components.css      # Component-specific styles
├── public/
│   ├── examples/
│   │   ├── call.json           # Example post-conversation payload
│   │   └── voyager.json        # Example SWML configuration
│   ├── favicon.svg             # SignalWire favicon
│   └── og-image.jpg            # OpenGraph social sharing image
├── capture-screenshots.js      # Playwright automation for screenshots + video
├── index.html                  # App shell with OpenGraph metadata
├── vite.config.js              # Vite configuration
└── package.json
```

## Using the Library Standalone

The `lib/` directory has no DOM dependencies and can be imported independently in Node.js or other browser apps:

```js
import { parsePayload, computeMetrics } from './lib/index.js';

const raw = JSON.parse(jsonString);
const payload = parsePayload(raw);      // Validates, normalizes timestamps
const metrics = computeMetrics(payload); // Returns all derived metrics

console.log(metrics.duration.callDuration);    // seconds
console.log(metrics.latency.avgAnswerTime);    // ms
console.log(metrics.asr.avgConfidence);        // 0-1
console.log(metrics.conversation.turnCount);   // number
console.log(metrics.tools.swaigCallCount);     // number
console.log(metrics.tokens.totalInputTokens);  // number or null
```

### Metric Modules

| Module | Key Outputs |
|--------|-------------|
| `duration` | `callDuration`, `aiSessionDuration`, `ringTime` — handles `call_end_date=0` (in-progress calls) |
| `latency` | `avgAnswerTime`, `p95AnswerTime`, `minAnswerTime`, `maxAnswerTime`, per-response latency array |
| `asr` | `avgConfidence`, `bargeInRate`, `bargeInCount`, `totalUserMessages` |
| `conversation` | `turnCount`, `messagesByRole`, `totalWords`, `assistantWordCount`, `userWordCount` |
| `tools` | `swaigCallCount`, `avgExecutionLatency`, `toolBreakdown` (by function name), `actionTypes`, `toolCallRate` |
| `tokens` | `totalInputTokens`, `totalOutputTokens`, `avgTps`, `peakTps`, per-response TPS array |

## Payload Format

The viewer expects the standard SignalWire `post_conversation` webhook payload. Required fields:

```json
{
  "call_id": "uuid",
  "action": "post_conversation",
  "call_start_date": 1770000000000000,
  "call_log": [...]
}
```

Key optional sections that unlock additional features:

| Field | Unlocks |
|-------|---------|
| `call_log[].timestamp` | Timeline swimlane, transcript ordering |
| `call_log[].audio_latency` | Response latency metrics and charts |
| `call_log[].confidence` | ASR confidence stats and histogram |
| `call_log[].speaking_to_final_event` | User speech duration on timeline |
| `times[]` | Tokens per second chart, detailed latency analysis |
| `swaig_log[]` | SWAIG Inspector tab, State Flow actions |
| `post_prompt_data` | Post-Prompt tab |
| `SWMLVars.record_call_url` | Recording tab with waveform + video |
| `total_input_tokens` / `total_output_tokens` | Token usage dashboard cards |
| `global_data` | Global Data tab (snapshot + timeline) |

## Edge Cases Handled

- **`call_end_date = 0`** — inferred from `session_end` log entry when available, otherwise displayed as "In Progress"
- **Missing token fields** — cards show "N/A," token charts are skipped
- **No `times[]` array** — TPS and detailed latency charts gracefully hidden
- **DTMF content in call_log** — displayed appropriately in transcript
- **Merged user messages** (`merge_count > 0`) — displayed as single messages per `call_log`
- **Barged assistant responses** — removed from `call_log` by the platform, handled cleanly
- **TPS int64 overflow** (from `token_time: 0`) — filtered out of stats
- **Consecutive assistant messages** (retries, garbled output) — timeline segments don't overlap
- **Tool timestamps** — correctly treated as call initiation time, not result time
- **Negative `speaking_to_turn_detection`** — common in production, handled without error
- **Webhook-forced function metaStep** — corrected when the module logs functions with the post-transition step instead of the step they actually ran in

## Tech Stack

| Tool | Purpose |
|------|---------|
| [Vite](https://vitejs.dev/) | Build tool and dev server |
| [Chart.js](https://www.chartjs.org/) | Dashboard and analytics charts |
| [Mermaid](https://mermaid.js.org/) | State flow and SWML step diagrams |
| [wavesurfer.js](https://wavesurfer.xyz/) | Stereo waveform rendering, audio/video playback, regions overlay |
| [Playwright](https://playwright.dev/) | Automated screenshot and video capture |

## License

MIT
