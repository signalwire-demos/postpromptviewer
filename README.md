# P.I.E. — PostPrompt Ingestion Engine

A full-stack application for ingesting, storing, searching, and visualizing SignalWire AI Agent post-conversation webhook payloads. Combines a **Python/FastAPI** backend with **SQLite** storage and a **Vanilla JS** single-page viewer powered by **DaisyUI 5**, **Chart.js**, **Mermaid**, and **wavesurfer.js**.

Point your SignalWire AI agent's `post_url` at the webhook endpoint and every completed call is automatically indexed with 30+ searchable metadata columns. Then browse, filter, and drill into any call from the web UI.

<div align="center">

<img src="images/ui-walkthrough.gif" alt="UI Walkthrough — every tab from a live GoAir demo call" width="800" />

*Full UI walkthrough — every tab from a live GoAir demo call ([MP4](videos/ui-walkthrough.mp4))*

</div>

## Quick Start

```bash
# Clone and install
git clone https://github.com/signalwire-demos/postpromptviewer.git
cd postpromptviewer
npm install

# Set up Python backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start both servers
uvicorn backend.main:app --reload --port 8000 &
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` requests to the FastAPI backend automatically.

### What You Can Do

- **Browse Records** — click the P.I.E. button on the landing page to search/filter stored calls
- **Drop a File** — drag-and-drop a `post_conversation` JSON to view it instantly, then click **Save to DB** to store it
- **Webhook Ingest** — point SignalWire's `post_url` at the webhook endpoint for automatic ingestion
- **SWML Inspector** — drop a SWML configuration file to inspect prompts, steps, and functions

## Webhook Ingestion

### Setting Up the Webhook

Configure your SignalWire AI agent's `post_url` to point at the ingest endpoint:

```
https://your-domain.com/api/v1/ingest/webhook
```

Every completed call will be automatically ingested with metadata extracted and indexed.

### HTTP Basic Auth

Protect the ingest endpoints with HTTP Basic Auth by setting the `PIE_WEBHOOK_AUTH` environment variable:

```bash
# Format: user:password
export PIE_WEBHOOK_AUTH="pie:s3cret"
```

Then use credentials in the `post_url`:

```
https://pie:s3cret@your-domain.com/api/v1/ingest/webhook
```

When `PIE_WEBHOOK_AUTH` is not set, ingest endpoints are open (useful for local development).

Auth protects all three ingest endpoints (`/webhook`, `/upload`, `/bulk`). Read-only endpoints (`/records`, `/stats`) do not require auth.

### Testing with curl

```bash
# Ingest a file (no auth)
curl -X POST http://localhost:8000/api/v1/ingest/webhook \
  -H "Content-Type: application/json" \
  -d @public/examples/call.json

# Ingest with auth
curl -X POST http://pie:s3cret@localhost:8000/api/v1/ingest/webhook \
  -H "Content-Type: application/json" \
  -d @public/examples/call.json

# Bulk ingest (JSON array)
curl -X POST http://localhost:8000/api/v1/ingest/bulk \
  -H "Content-Type: application/json" \
  -d '[{...}, {...}]'

# Upsert (overwrite existing)
curl -X POST "http://localhost:8000/api/v1/ingest/webhook?upsert=true" \
  -H "Content-Type: application/json" \
  -d @call.json
```

## API Reference

Base path: `/api/v1`

### Ingest Endpoints (auth-protected when `PIE_WEBHOOK_AUTH` is set)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest/webhook` | Receive raw JSON body (for SignalWire `post_url`) |
| `POST` | `/ingest/upload` | Upload a single JSON file (multipart) |
| `POST` | `/ingest/bulk` | Upload multiple files or a JSON array |

All ingest endpoints accept `?upsert=true` to overwrite existing records with the same `call_id`.

### Records Endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/records` | List/search records (paginated, filtered, sorted) |
| `GET` | `/records/stats` | Aggregate statistics |
| `GET` | `/records/{call_id}` | Get full record with raw payload |
| `DELETE` | `/records/{call_id}` | Delete a record |

### Search & Filter Parameters (`GET /records`)

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search call_id, phone numbers, app name |
| `page` / `per_page` | int | Pagination (default: 1 / 25, max 100) |
| `sort` / `order` | string | Sort field + `asc`/`desc` |
| `ai_result` | string | Filter: `success`, `failed` |
| `performance_rating` | string | Filter: `Excellent`, `Good`, `Fair`, `Needs Improvement` |
| `call_ended_by` | string | Filter: `user`, `assistant`, `system` |
| `call_direction` | string | Filter: `inbound`, `outbound` |
| `conversation_type` | string | Filter: `voice`, etc. |
| `app_name` | string | Filter by app name |
| `project_id` / `space_id` | string | Filter by project or space |
| `date_from` / `date_to` | ISO date | Date range filter |
| `min_duration` / `max_duration` | float | Duration range (seconds) |

Interactive API docs available at **http://localhost:8000/docs** (Swagger UI).

## Viewer Tabs

When you load a record (from the database or a dropped file), the viewer shows these tabs:

| Tab | What It Shows |
|-----|---------------|
| **Dashboard** | KPI metric cards — duration, latency, tokens, ASR confidence, barge-in rate, SWAIG calls |
| **Charts** | 6 Chart.js visualizations — latency breakdown, TPS, ASR confidence, role distribution |
| **Timeline** | Horizontal swimlane — call phases + conversation flow mapped to real timestamps |
| **Transcript** | Role-colored conversation bubbles with metadata badges, search, and filters |
| **SWAIG Inspector** | Accordion of every function call with request/response JSON and search |
| **Post-Prompt** | Raw, substituted, and parsed post-prompt data |
| **State Flow** | Interactive Mermaid diagram — state transitions, function calls, SWAIG actions |
| **Recording** | Stereo waveform with call-log regions, synced video playback |
| **Global Data** | Session state snapshot + animated timeline of `set_global_data` mutations |

## Database

P.I.E. uses **SQLite** with WAL mode for concurrent read/write. The database file (`pie.db`) is created automatically on first startup.

### Indexed Metadata Columns

The raw JSON payload is stored as-is in a `raw_payload` JSON column. Additionally, 30+ metadata fields are extracted at ingest time for fast searching and filtering:

- **Identity**: `call_id`, `project_id`, `space_id`, `app_name`, `conversation_id`
- **Timestamps**: `call_start_ts`, `call_answer_ts`, `ai_start_ts`, `ai_end_ts`, `call_end_ts`
- **Caller**: `caller_id_number`, `from_number`, `to_number`, `call_direction`, `call_type`
- **Duration**: `call_duration_sec`, `ai_session_duration_sec`
- **AI Result**: `ai_result`, `call_ended_by`, `hard_timeout`, `content_disposition`
- **Metrics**: `turn_count`, `swaig_call_count`, `avg_latency_ms`, `p95_latency_ms`, `performance_rating`
- **Tokens**: `total_input_tokens`, `total_output_tokens`
- **ASR**: `avg_asr_confidence`, `barge_in_count`

### Customizing the DB Location

```bash
export PIE_DB_PATH=/path/to/my/pie.db
```

## Architecture

```
postpromptviewer/
├── backend/                    # Python FastAPI backend
│   ├── main.py                 # App, CORS, lifespan, static mount
│   ├── config.py               # DB path, webhook auth from env
│   ├── database.py             # SQLAlchemy async engine + session
│   ├── models.py               # Record model (30+ columns)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── routers/
│   │   ├── ingest.py           # Webhook, upload, bulk (auth-protected)
│   │   └── records.py          # List, get, delete, stats
│   └── services/
│       └── extractor.py        # Metadata extraction (Python port of parser.js)
├── lib/                        # Standalone JS library (no DOM deps)
│   ├── index.js                # Public API: parsePayload, computeMetrics
│   ├── parser.js               # Validate + normalize raw JSON
│   ├── utils.js                # Shared helpers
│   └── metrics/                # 7 metric computation modules
├── src/                        # Frontend SPA
│   ├── main.js                 # App entry, tab routing
│   ├── state.js                # Pub/sub state store
│   ├── api.js                  # API client for backend
│   ├── components/
│   │   ├── drop-zone.js        # Landing page with P.I.E. browse button
│   │   ├── record-browser.js   # Searchable record list (DaisyUI table)
│   │   ├── header.js           # Navbar with Save to DB / Back to Records
│   │   ├── dashboard.js        # KPI stat cards
│   │   └── ...                 # 12 more viewer components
│   └── styles/
│       ├── signalwire-daisyui-theme.css  # SignalWire design tokens
│       ├── theme.css           # CSS variable bridge
│       └── components.css      # Component styles
├── public/examples/            # Sample data files
├── requirements.txt            # Python dependencies
├── package.json                # Node dependencies
├── vite.config.js              # Vite + API proxy config
├── Procfile                    # Production: uvicorn
└── pie.db                      # SQLite database (auto-created)
```

## Design System

The UI uses **DaisyUI 5** with the **SignalWire design tokens** (dark/light themes):

- **Primary**: `#044EF4` (SignalWire Blue)
- **Secondary**: `#F72A72` (SignalWire Pink)
- **Accent**: `#40E0D0` (Turquoise)
- **Fonts**: Outfit (body), Instrument Sans (headings), JetBrains Mono (code)

## Deployment (Dokku)

```bash
# Add Python buildpack alongside Node.js
cat > .buildpacks << 'EOF'
https://github.com/heroku/heroku-buildpack-nodejs.git
https://github.com/heroku/heroku-buildpack-python.git
EOF

# Set webhook auth
dokku config:set myapp PIE_WEBHOOK_AUTH="pie:s3cret"

# Deploy
git push dokku main
```

The `Procfile` runs `uvicorn backend.main:app` which serves both the API and the Vite-built static files from `dist/`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIE_DB_PATH` | `./pie.db` | SQLite database file path |
| `PIE_WEBHOOK_AUTH` | *(empty)* | HTTP Basic Auth for ingest endpoints (`user:password`) |
| `PORT` | `8000` | Server port (set by Dokku/Heroku) |

## Tech Stack

| Tool | Purpose |
|------|---------|
| [FastAPI](https://fastapi.tiangolo.com/) | Backend API + webhook ingestion |
| [SQLAlchemy](https://www.sqlalchemy.org/) | Async ORM for SQLite |
| [SQLite](https://www.sqlite.org/) | Embedded database with WAL mode |
| [Vite](https://vitejs.dev/) | Frontend build tool and dev server |
| [DaisyUI 5](https://daisyui.com/) | UI components + SignalWire theme |
| [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS |
| [Chart.js](https://www.chartjs.org/) | Dashboard charts |
| [Mermaid](https://mermaid.js.org/) | State flow diagrams |
| [wavesurfer.js](https://wavesurfer.xyz/) | Audio waveform visualization |

## License

MIT
