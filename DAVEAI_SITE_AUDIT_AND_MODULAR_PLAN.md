# DaveAI.tech — Complete Site Audit & Modular Redesign Plan

> Generated: 2026-03-23 | Server: 187.77.30.206 | Domain: daveai.tech

---

## 1. EXECUTIVE SUMMARY

**daveai.tech core website** (excluding games) is a **~3MB code + 17MB intro videos** monolith.
The main file `daveai-ui-v6.html` is a **600KB / 15,475-line / 397-function** single HTML file
with all CSS and JS inline. It depends on **5 backend services** and **22 API endpoints**.

### Size Breakdown (Server — Production)

| Component | Size | Files | Lines |
|---|---|---|---|
| **daveai-ui-v6.html** (monolith) | 600 KB | 1 | 15,475 |
| **js/** (v7 split — unused by v6) | 387 KB | 15 | 7,454 |
| **css/** (v7 split — unused by v6) | 139 KB | 10 | 6,389 |
| **intros/** (MP4 videos) | 17 MB | 4 | — |
| **studio/** | 79 KB | 1 | 1,379 |
| **public/** | 1 KB | 1 | — |
| **serve.py** (games API) | 8 KB | 1 | 194 |
| **agent-brain/** (Python API) | 2 MB | 34 | 10,043 |
| **edge-tts-server.py** | 12 KB | 1 | 242 |
| **agentic-ui/** (Next.js source) | ~130 KB | 26 | ~3,200 |
| **litellm/** (config) | 4 KB | 1 | 101 |
| **nginx config** | 10 KB | 1 | 222 |
| **daveai.db** (SQLite) | 1.4 MB | 1 | — |
| | | | |
| **TOTAL CORE (no games)** | **~20 MB** | **~115** | **~45,000** |
| games/ (EXCLUDED) | 1.9 GB | 13,972 | — |
| .git/ (EXCLUDED) | 1.4 GB | 36 | — |

### What's Actually Serving daveai.tech Right Now

The **live site** is just `daveai-ui-v6.html` (symlinked as `index.html`).
The v7 split files (js/, css/) and the agentic-ui Next.js app exist on disk
but are **not actively used** — v6.html has everything inline.

---

## 2. COMPLETE DEPENDENCY CHAIN — What v6.html Needs to Function E2E

### 2.1 External CDN Resources (loaded in `<head>`)

| Resource | URL | Purpose |
|---|---|---|
| Google Fonts | `fonts.googleapis.com` (Syne + DM Sans) | Typography |
| Font Awesome 6.5 | `cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0` | Icons |

> **No other external JS/CSS.** Everything else is inline in the 600KB HTML file.

### 2.2 External API Calls (browser → internet)

| API | URL | Purpose |
|---|---|---|
| World Time | `worldtimeapi.org/api/ip` | Timezone detection for clock |
| HuggingFace TTS | `api-inference.huggingface.co/models/*` | Tier 2 voice fallback |

### 2.3 Internal API Endpoints (browser → nginx → backend)

All calls go through `/api/*` which nginx proxies to the appropriate backend service.

#### Auth (→ agent-brain :8888)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login (JWT) |
| POST | `/api/admin/login` | Legacy admin login fallback |

#### Chat & AI (→ agent-brain :8888)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/stream` | **SSE streaming chat** (main AI interaction) |
| POST | `/api/db/chat/fallback` | Fallback when brain/LLM unavailable |

#### Status & Health (→ agent-brain :8888)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API health check |
| GET | `/api/status` | System status (models, uptime) |
| GET | `/api/tools` | Available tool list |
| GET | `/api/log` | Build/activity log |
| GET | `/api/pages` | Page/project list |
| GET | `/api/agents/status` | Agent panel (supervisor/coder/qa/asset) |

#### Tools & DB (→ agent-brain :8888)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/run-tool` | Execute agent tool |
| POST | `/api/db/query` | Raw SQL query (admin) |
| PATCH | `/api/db/users/{name}` | Update user profile |

#### Admin (→ agent-brain :8888)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |

#### Voice / TTS (→ edge-tts :5050)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/tts` | Kokoro/Chatterbox neural TTS |
| POST | `/api/edge-tts` | Edge TTS (Microsoft Neural) |

#### Media (→ agent-brain :8888)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/transcribe` | Voice-to-text (audio upload) |
| POST | `/api/upload-image` | Image upload for chat |

#### Games (→ serve-api :8090)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/games` | Game carousel list |

### 2.4 Voice System — 4-Tier Fallback Chain

```
User clicks speak / AI responds
       │
       ▼
  ┌─ Tier 0: Local voice engine (admin — AllTalk/Kokoro/Chatterbox localhost)
  │    └─ Falls through if not configured
  ▼
  ┌─ Tier 1: Kokoro/Chatterbox Server → POST /api/tts (port 5050)
  │    └─ 5-second timeout, falls through on failure
  ▼
  ┌─ Tier 2: HuggingFace Inference API (browser-direct, free)
  │    └─ Only if hfEnabled=true in Voice Studio config
  ▼
  ┌─ Tier 3: Edge TTS → POST /api/edge-tts (port 5050)
  │    └─ Microsoft Neural voices, free, no API key
  ▼
  └─ Tier 4: Browser SpeechSynthesis (quality-ranked neural)
       └─ Always available as final fallback
```

**Failsafe**: A 3-second browser TTS warmup fires in parallel so the user
always hears *something* even if all servers are down.

### 2.5 Browser Storage (localStorage keys)

| Key | Purpose |
|---|---|
| `daveai_token` | JWT auth token |
| `daveai_token_ts` | Token timestamp (24h TTL) |
| `daveai_user` | User object (name, email, role) |
| `daveai_layout` | Selected layout preset |
| `daveai_chat_history` | Chat history (max 100 entries) |
| `daveai_voice_studio` | Full voice settings blob |
| `daveai_chat_mode` | Chat mode (text/voice/full/always-on) |
| `daveai_immersive` | Immersive mode preference |
| `daveai_edgehover` | Edge hover panels preference |
| `daveai_demo` | Demo project config |
| `daveai_demo_enabled` | Demo mode on/off |
| `daveai_show_ext` | Show extensions toggle |
| `daveai_ext_unlocked` | Admin extension unlock |
| `daveai_projects` | Saved projects list |
| `daveai_intro_pref` | Intro video preference |

### 2.6 Static Files Required

| File | Size | Purpose |
|---|---|---|
| `daveai-ui-v6.html` (→ index.html) | 600 KB | The entire frontend |
| `intros/manifest.json` | 323 B | Intro video catalog |
| `intros/fe-male-intro.mp4` | 6.2 MB | Neutral intro video |
| `intros/female-intro.mp4` | 5.2 MB | Female intro video |
| `intros/male-intro.mp4` | 5.3 MB | Male intro video |
| `favicon.ico` | ~1 KB | Browser tab icon |
| `404.html` | ~1 KB | Error page |
| `50x.html` | ~1 KB | Server error page |

### 2.7 Backend Services Required (5 services)

| Service | Port | Runtime | Role | Lines |
|---|---|---|---|---|
| **agent-brain** | 8888 | Python/FastAPI | All API logic, auth, chat, tools, DB | 10,043 |
| **edge-tts** | 5050 | Python/FastAPI | TTS voice synthesis | 242 |
| **serve-api** | 8090 | Python | Games list + static files | 194 |
| **nginx** | 80/443 | nginx | Reverse proxy, SSL, routing | 222 |
| **agentic-ui** | 3001 | Node.js/Next.js | Alternate UI (not primary) | ~3,200 |

### 2.8 Database (SQLite)

- **File**: `daveai.db` (1.4 MB)
- **Location**: `/opt/agent-brain/daveai.db`
- Tables: users, projects, builds, chat_history, agent_memory (schema in brain_db.py)

### 2.9 Environment Variables (agent-brain/.env)

```
ZEROCLAW_URL          # ZeroClaw coding agent
ZEROCLAW_SECRET       # ZeroClaw auth
LITELLM_URL           # LLM router
WORKSPACE             # Filesystem workspace path
GIT_REMOTE            # Git remote URL
HEAVY_MODEL           # Heavy LLM model name
FAST_MODEL            # Fast LLM model name
VISION_MODEL          # Vision LLM model name
AUTONOMY              # Agent autonomy level
SITE_URL              # Public site URL
JWT_SECRET            # Auth token signing key
ADMIN_EMAIL           # Admin email
ANTHROPIC_API_KEY     # Claude fallback
GITLAB_URL            # GitLab integration
SMTP_HOST/PORT/USER/PASS  # Email sending
```

---

## 3. COMPLETE FILE MANIFEST — VPS2 (Clean Backup)

**Location**: `G:\github\VPS2\`

```
VPS2/                              # Clean 1:1 backup of daveai.tech
├── .git/                          # Git initialized, ready for GitHub
├── .gitignore                     # Ignores secrets, node_modules, .db
│
├── frontend/                      # ── STATIC FRONTEND ──
│   ├── daveai-ui-v6.html          # 600KB monolith (= index.html)
│   ├── favicon.ico
│   ├── 404.html
│   ├── 50x.html
│   ├── css/                       # 10 CSS files (v7 split, 6,389 lines)
│   │   ├── agents.css
│   │   ├── animations.css
│   │   ├── base.css
│   │   ├── canvas.css
│   │   ├── chat.css
│   │   ├── modals.css
│   │   ├── panels.css
│   │   ├── sidebar.css
│   │   ├── topbar.css
│   │   └── voice.css
│   ├── js/                        # 15 JS files (v7 split, 7,454 lines)
│   │   ├── admin.js
│   │   ├── agents.js
│   │   ├── app.js
│   │   ├── auth.js
│   │   ├── canvas.js
│   │   ├── chat.js
│   │   ├── config.js
│   │   ├── database.js
│   │   ├── discuss.js
│   │   ├── panels.js
│   │   ├── personality.js         # 1,822 lines
│   │   ├── state.js
│   │   ├── status.js
│   │   ├── tools.js
│   │   └── voice.js               # 2,088 lines
│   ├── intros/                    # Intro videos (17MB)
│   │   ├── manifest.json
│   │   ├── fe-male-intro.mp4
│   │   ├── female-intro.mp4
│   │   └── male-intro.mp4
│   ├── public/
│   │   └── favicon.svg
│   └── studio/
│       └── index.html             # Voice Studio standalone (79KB)
│
├── agent-brain/                   # ── PYTHON API BACKEND ──
│   ├── .env.example               # Sanitized env template
│   ├── requirements.txt
│   ├── brain.py                   # Entry point
│   ├── brain_api.py               # FastAPI routes (933L)
│   ├── brain_auth.py              # JWT auth (122L)
│   ├── brain_core.py              # Config/constants (96L)
│   ├── brain_db.py                # SQLite ORM (181L)
│   ├── brain_db_api.py            # DB REST endpoints (536L)
│   ├── brain_llm.py               # LLM abstraction (188L)
│   ├── brain_tools.py             # Agent tools (292L)
│   ├── brain_users.py             # User management (263L)
│   ├── brain_events.py            # Event system (108L)
│   ├── brain_memory.py            # Agent memory (91L)
│   ├── brain_skills.py            # Skill registry (84L)
│   ├── brain_watchdog.py          # Health monitor (136L)
│   ├── brain_graph.py             # Knowledge graph (481L)
│   ├── brain_pipelines.py         # Task pipelines (663L)
│   ├── brain_assets.py            # Asset management (382L)
│   ├── brain_deploy.py            # Deployment tools (339L)
│   ├── brain_discuss.py           # Discussion system (368L)
│   ├── brain_openhands.py         # OpenHands integration (302L)
│   ├── brain_visual_qa.py         # Visual QA (348L)
│   ├── brain_checkpoint.py        # Checkpointing (244L)
│   ├── brain_alice.py             # Alice agent (257L)
│   ├── brain_goose.py             # Goose bridge (170L)
│   ├── agent_skills.py            # Skills entry (180L)
│   ├── agent_skills_p1.py         # Skills part 1 (503L)
│   ├── agent_skills_p2.py         # Skills part 2 (308L)
│   ├── agent_skills_p3.py         # Skills part 3 (864L)
│   ├── brain_v4_part1.py          # V4 routes pt1 (263L)
│   ├── brain_v4_part2.py          # V4 routes pt2 (531L)
│   ├── self_improve.py            # Self-improvement cron (117L)
│   ├── watchdog.py                # Legacy watchdog (79L)
│   ├── patch_reasoning.py         # Reasoning patch (49L)
│   ├── write_skills_p2.py         # Skills writer (314L)
│   ├── edge-tts-server.py         # TTS server (242L)
│   ├── start.sh                   # Brain start script
│   ├── edge-tts-start.sh          # TTS start script
│   ├── start-edge-tts.sh          # Alt TTS start
│   └── keyvault.json              # Key vault
│
├── agentic-ui/                    # ── NEXT.JS ALTERNATE UI ──
│   ├── app/
│   │   ├── page.tsx               # Main page (559L)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── AdminPanel.tsx          # (610L)
│   │   ├── ChatStream.tsx          # (401L)
│   │   ├── Sidebar.tsx             # (428L)
│   │   ├── AgentPanel.tsx          # (301L)
│   │   ├── DiscussionPanel.tsx     # (235L)
│   │   └── BuildTimeline.tsx       # (101L)
│   ├── lib/
│   │   ├── api.ts                  # (292L)
│   │   └── sse.ts                  # (171L)
│   ├── package.json
│   ├── Dockerfile
│   └── ...config files
│
├── edge-tts/                      # ── TTS SERVICE ──
│   ├── edge-tts-server.py
│   └── edge-tts-start.sh
│
├── serve-api/                     # ── GAMES/STATIC API ──
│   └── serve.py                   # (194L)
│
├── litellm/                       # ── LLM ROUTER CONFIG ──
│   └── config.yaml                # Model routing rules
│
├── nginx/                         # ── REVERSE PROXY ──
│   ├── daveai.tech.conf           # Site config (222L)
│   └── nginx.conf                 # Main nginx config
│
└── docker/                        # ── DOCKERFILES ──
    ├── Dockerfile.website
    └── Dockerfile.ui
```

**Total: 109 files, ~47,216 lines of code, ~20MB on disk (including 17MB video)**

---

## 4. MODULAR REDESIGN — VPS3 Architecture

**Location**: `G:\github\VPS3\`

### 4.1 Design Principles

1. **Each section = its own Docker container** — isolated, independently deployable
2. **Shared nothing** — containers communicate only via HTTP/gRPC over Docker network
3. **Fault isolation** — if one container crashes, others keep running
4. **Auto-backup** — snapshot known-good states, rollback on failure
5. **Git-per-container** — each container dir is independently versionable

### 4.2 Container Architecture

```
                    ┌─────────────┐
                    │   NGINX     │ :80/:443
                    │  (gateway)  │ SSL termination, routing
                    └──────┬──────┘
                           │
         ┌─────────┬───────┼───────┬──────────┐
         ▼         ▼       ▼       ▼          ▼
   ┌──────────┐ ┌──────┐ ┌─────┐ ┌──────┐ ┌──────────┐
   │ FRONTEND │ │ BRAIN│ │ TTS │ │ LLM  │ │ SERVE-API│
   │ (static) │ │ API  │ │     │ │ROUTER│ │ (games)  │
   │ :8080    │ │:8888 │ │:5050│ │:4000 │ │ :8090    │
   └──────────┘ └──┬───┘ └─────┘ └──────┘ └──────────┘
                   │
              ┌────┴────┐
              │ SQLite  │
              │ (volume)│
              └─────────┘
```

### 4.3 Docker Compose Structure

```yaml
# docker-compose.yml
version: '3.9'

networks:
  daveai-net:
    driver: bridge

volumes:
  brain-data:      # SQLite DB + persistent state
  backup-data:     # Auto-backup snapshots
  intros-data:     # Intro videos (shared)

services:

  # ── 1. NGINX GATEWAY ──
  nginx:
    build: ./containers/nginx
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - frontend
      - agent-brain
      - edge-tts
    networks: [daveai-net]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      retries: 3

  # ── 2. FRONTEND (static HTML/CSS/JS) ──
  frontend:
    build: ./containers/frontend
    networks: [daveai-net]
    volumes:
      - intros-data:/app/intros
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/"]
      interval: 30s

  # ── 3. AGENT-BRAIN API ──
  agent-brain:
    build: ./containers/agent-brain
    env_file: ./shared/secrets/.env.brain
    networks: [daveai-net]
    volumes:
      - brain-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8888/api/health"]
      interval: 30s

  # ── 4. EDGE-TTS ──
  edge-tts:
    build: ./containers/edge-tts
    networks: [daveai-net]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5050/api/health"]
      interval: 30s

  # ── 5. LITELLM ROUTER ──
  litellm:
    build: ./containers/litellm
    env_file: ./shared/secrets/.env.litellm
    networks: [daveai-net]
    restart: unless-stopped

  # ── 6. SERVE-API (games/static) ──
  serve-api:
    build: ./containers/serve-api
    networks: [daveai-net]
    restart: unless-stopped

  # ── 7. AGENTIC-UI (Next.js alternate) ──
  agentic-ui:
    build: ./containers/agentic-ui
    networks: [daveai-net]
    restart: unless-stopped

  # ── 8. BACKUP AGENT ──
  backup-agent:
    build: ./containers/backup-agent
    volumes:
      - brain-data:/data/brain:ro
      - backup-data:/backups
    networks: [daveai-net]
    restart: unless-stopped
```

### 4.4 Backup Strategy

```
backup-agent container runs:
  1. Every 6 hours: snapshot brain-data volume → timestamped tar.gz
  2. On health-check-pass: mark snapshot as "known-good"
  3. Keep last 10 known-good snapshots
  4. On brain container crash → auto-restore last known-good
  5. Daily: push backup to off-site (S3/Backblaze B2)
```

### 4.5 Container Isolation — What Each Container Owns

| Container | Owns | Exposes | Can Fail Without Breaking |
|---|---|---|---|
| **frontend** | HTML, CSS, JS, intros | :8080 (HTTP) | Voice still works, chat fails gracefully |
| **agent-brain** | Python API, DB | :8888 (HTTP) | Frontend shows "offline", TTS still works |
| **edge-tts** | TTS engine | :5050 (HTTP) | Falls back to browser SpeechSynthesis |
| **litellm** | LLM routing | :4000 (HTTP) | Brain uses direct API keys as fallback |
| **serve-api** | Game list | :8090 (HTTP) | Game carousel empty, everything else works |
| **nginx** | SSL, routing | :80/:443 | Nothing works (but auto-restarts) |
| **backup-agent** | Snapshots | — (internal) | No user impact, backups pause |

### 4.6 Frontend Modularization Plan

The 600KB monolith `daveai-ui-v6.html` should be split into modules:

```
containers/frontend/
├── Dockerfile
├── nginx.conf              # Internal nginx for static serving
├── index.html              # Shell — loads modules
├── modules/
│   ├── auth/               # Login/register overlay
│   │   ├── auth.js
│   │   └── auth.css
│   ├── chat/               # Chat panel + SSE streaming
│   │   ├── chat.js
│   │   └── chat.css
│   ├── voice/              # Voice Studio + TTS engine
│   │   ├── voice.js
│   │   └── voice.css
│   ├── agents/             # Agent status panel
│   │   ├── agents.js
│   │   └── agents.css
│   ├── canvas/             # Preview/canvas panel
│   │   ├── canvas.js
│   │   └── canvas.css
│   ├── admin/              # Admin panel + DB explorer
│   │   ├── admin.js
│   │   └── admin.css
│   ├── tools/              # Tool runner panel
│   │   ├── tools.js
│   │   └── tools.css
│   ├── sidebar/            # Left sidebar navigation
│   │   ├── sidebar.js
│   │   └── sidebar.css
│   ├── topbar/             # Top bar + status
│   │   ├── topbar.js
│   │   └── topbar.css
│   ├── settings/           # Settings overlay
│   │   ├── settings.js
│   │   └── settings.css
│   ├── intro/              # Intro video system
│   │   ├── intro.js
│   │   └── intro.css
│   ├── personality/        # DaveAI personality engine
│   │   ├── personality.js
│   │   └── personality.css
│   └── shared/             # Shared utilities
│       ├── state.js        # Global state management
│       ├── api.js          # API client (fetch wrappers)
│       ├── config.js       # URLs, constants
│       └── base.css        # CSS variables, reset
├── intros/
│   ├── manifest.json
│   └── *.mp4
└── public/
    ├── favicon.ico
    └── favicon.svg
```

Each module is **self-contained**: its own JS + CSS.
`index.html` is a thin shell that lazy-loads modules on demand.
**If a module fails to load, the others still work.**

---

## 5. VPS3 DIRECTORY STRUCTURE

```
G:\github\VPS3\
├── .git/
├── .gitignore
├── docker-compose.yml              # Orchestrates all containers
├── docker-compose.dev.yml          # Dev overrides (hot reload, debug)
├── Makefile                        # make up, make down, make backup, make deploy
│
├── containers/
│   ├── frontend/                   # Container 1: Static site
│   │   ├── Dockerfile
│   │   └── (modular frontend files)
│   ├── agent-brain/                # Container 2: Python API
│   │   ├── Dockerfile
│   │   └── (all brain_*.py files)
│   ├── edge-tts/                   # Container 3: TTS service
│   │   ├── Dockerfile
│   │   └── edge-tts-server.py
│   ├── litellm/                    # Container 4: LLM router
│   │   ├── Dockerfile
│   │   └── config.yaml
│   ├── nginx/                      # Container 5: Gateway
│   │   ├── Dockerfile
│   │   └── daveai.tech.conf
│   ├── serve-api/                  # Container 6: Games API
│   │   ├── Dockerfile
│   │   └── serve.py
│   ├── agentic-ui/                 # Container 7: Next.js UI
│   │   ├── Dockerfile
│   │   └── (Next.js source)
│   └── backup-agent/               # Container 8: Auto-backup
│       ├── Dockerfile
│       └── backup.sh
│
├── shared/
│   ├── config/                     # Shared configs
│   │   └── domains.yaml
│   ├── secrets/                    # .env files (gitignored)
│   │   ├── .env.brain
│   │   ├── .env.litellm
│   │   └── .env.tts
│   └── data/                       # Persistent data (gitignored)
│       └── daveai.db
│
├── scripts/
│   ├── deploy.sh                   # Push to VPS
│   ├── backup.sh                   # Manual backup trigger
│   ├── restore.sh                  # Restore from backup
│   └── health-check.sh             # Verify all services
│
└── docs/
    └── DAVEAI_SITE_AUDIT_AND_MODULAR_PLAN.md  # This file
```

---

## 6. MIGRATION PATH: VPS2 → VPS3

| Step | Action | Risk |
|---|---|---|
| 1 | VPS2 is the **working backup** — never modify it | None |
| 2 | Copy source files from VPS2 into VPS3 container dirs | None |
| 3 | Write Dockerfiles for each container | None |
| 4 | Write docker-compose.yml | None |
| 5 | Split daveai-ui-v6.html into modules in frontend/ | Medium — test carefully |
| 6 | Test locally with `docker compose up` | None |
| 7 | Deploy to VPS alongside existing site | Low |
| 8 | DNS switch: point daveai.tech to new containers | Low — instant rollback |
| 9 | Tear down old PM2-based setup | After verification |

---

## 7. GITHUB SETUP

### VPS2 (backup repo)
```bash
cd G:\github\VPS2
git remote add origin https://github.com/YOUR_USER/daveai-backup.git
git push -u origin master
```

### VPS3 (modular redesign)
```bash
cd G:\github\VPS3
git remote add origin https://github.com/YOUR_USER/daveai-modular.git
git push -u origin master
```

> Replace `YOUR_USER` with your GitHub username.
> Consider making repos **private** since they contain architecture details.

---

## 8. QUICK REFERENCE

### Current Live Stack
- **Frontend**: Single 600KB HTML file (nginx static)
- **API**: FastAPI on port 8888 (PM2 managed)
- **TTS**: edge-tts-server.py on port 5050 (PM2 managed)
- **DB**: SQLite file at /opt/agent-brain/daveai.db
- **Proxy**: nginx reverse proxy
- **Process manager**: PM2

### Target Stack (VPS3)
- **Frontend**: Modular HTML/JS/CSS in Docker (nginx container)
- **API**: FastAPI in Docker container
- **TTS**: edge-tts in Docker container
- **DB**: SQLite in Docker volume (auto-backed up)
- **Proxy**: nginx in Docker container
- **Orchestrator**: Docker Compose
- **Backup**: Automated container with known-good snapshots
