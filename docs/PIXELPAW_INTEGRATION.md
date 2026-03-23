# PixelPaw Integration — VPS3 Ecosystem Add-on

> **PixelPaw**: VS Code extension that visualizes AI coding agents as animated pixel art characters  
> **Integration Goal**: Make PixelPaw downloadable from daveai.tech + ensure seamless API connectivity

---

## 1. WHAT IS PIXELPAW?

PixelPaw is a **VS Code extension** (not a web app) that:
- Displays a pixel art office where each Claude Code / AI agent terminal spawns an animated character
- Connects to **daveai.tech Agent Brain** via HTTP API for chat/voice/agent routing
- Uses **daveai.tech TTS** (edge-tts-server.py) for voice synthesis
- Runs **client-side** on the user's machine inside VS Code

### Current DaveAI Integration (Already Built-in)

From `@G:\Github\PixelPaw\src\agents\daveaiBridge.ts:30-35`:
```typescript
const DEFAULT_CONFIG: DaveAIBridgeConfig = {
  baseUrl: 'https://daveai.tech',
  agentBrainUrl: 'https://daveai.tech/api',
  ttsUrl: 'https://daveai.tech',
  defaultAgentName: 'Alice',
};
```

**API Calls PixelPaw Makes to daveai.tech**:
- `POST /api/chat` — Send user message to Agent Brain, get response
- `GET /api/health` — Agent Brain health check
- TTS endpoints via VoiceManager (uses daveai.tech TTS URL)

---

## 2. CONTAINERIZATION STRATEGY

PixelPaw **cannot run in a Docker container** (it's a VS Code extension), but we can containerize its **build + distribution** system.

### Container Architecture

```
┌─────────────────────────────────────────────────────────┐
│  VPS3 Ecosystem (Docker Compose)                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐           │
│  │  FRONTEND  │  │   BRAIN   │  │   TTS    │           │
│  │  (static)  │  │   (API)   │  │ (edge)   │           │
│  │   :8080    │  │   :8888   │  │  :5050   │           │
│  └────────────┘  └───────────┘  └──────────┘           │
│                                                          │
│  ┌────────────────────────────────────────┐             │
│  │  PIXELPAW-BUILDER                      │             │
│  │  • Builds .vsix from G:/Github/PixelPaw│             │
│  │  • Serves .vsix download at /downloads │             │
│  │  • Hosts docs at /pixelpaw/docs        │             │
│  │  • Port :8085                           │             │
│  └────────────────────────────────────────┘             │
│                                                          │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │
         ┌──────────────┴──────────────┐
         │  User's VS Code             │
         │  PixelPaw extension installed│
         │  Connects to daveai.tech API │
         └─────────────────────────────┘
```

---

## 3. INTEGRATION APPROACH

### 3.1 PixelPaw Builder Container

**Purpose**: Automate building and serving the PixelPaw extension

```dockerfile
# containers/pixelpaw-builder/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN npm install -g @vscode/vsce

# Copy PixelPaw source
COPY . .

# Install dependencies
RUN npm install && \
    cd webview-ui && npm install && cd ..

# Build extension
RUN npm run package

# Serve built .vsix
RUN npm install -g serve
EXPOSE 8085

CMD ["sh", "-c", "cp *.vsix /app/public/ && serve /app/public -p 8085"]
```

**Features**:
- Auto-builds `pixelpaw-X.X.X.vsix` on container start
- Serves `.vsix` file at `http://daveai.tech/downloads/pixelpaw.vsix`
- Rebuilds on source changes (mount `G:\Github\PixelPaw` as volume in dev)

### 3.2 Download Page on Frontend

Add to `@G:\github\VPS3\containers\frontend\index.html`:

```html
<section id="extensions">
  <h2>Extensions & Add-ons</h2>
  <div class="extension-card">
    <img src="/assets/pixelpaw-icon.svg" alt="PixelPaw">
    <h3>PixelPaw for VS Code</h3>
    <p>Visualize your AI coding agents as animated pixel art characters in a virtual office.</p>
    <a href="/downloads/pixelpaw.vsix" download class="btn-download">
      Download Extension (.vsix)
    </a>
    <a href="/pixelpaw/docs" class="btn-docs">Documentation</a>
  </div>
</section>
```

### 3.3 NGINX Routing

Add to `@G:\github\VPS3\containers\nginx\daveai.tech.conf`:

```nginx
# PixelPaw extension downloads
location /downloads {
    proxy_pass http://pixelpaw-builder:8085/;
    proxy_set_header Host $host;
}

# PixelPaw documentation
location /pixelpaw/docs {
    proxy_pass http://pixelpaw-builder:8085/docs/;
    proxy_set_header Host $host;
}
```

---

## 4. DOCKER COMPOSE INTEGRATION

Add to `@G:\github\VPS3\docker-compose.yml`:

```yaml
services:
  # ... existing services ...

  # ── 9. PIXELPAW BUILDER ───────────────────────────────
  pixelpaw-builder:
    build:
      context: ../../PixelPaw  # Points to G:\github\PixelPaw
      dockerfile: ../../VPS3/containers/pixelpaw-builder/Dockerfile
    container_name: daveai-pixelpaw-builder
    networks: [daveai-net]
    volumes:
      # Dev mode: mount source for hot rebuild
      - ../../PixelPaw:/app:ro
      - pixelpaw-builds:/app/public
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8085/"]
      interval: 60s
      timeout: 5s
      retries: 3

volumes:
  # ... existing volumes ...
  pixelpaw-builds:
    driver: local
```

---

## 5. API INTEGRATION — What PixelPaw Needs from VPS3

### 5.1 Endpoints PixelPaw Uses (Already Available)

| PixelPaw Call | VPS3 Endpoint | Container | Status |
|---|---|---|---|
| `POST /api/chat` | `/api/stream` (SSE) | agent-brain | ✅ Available |
| `GET /api/health` | `/api/health` | agent-brain | ✅ Available |
| TTS synthesis | `/api/tts` | edge-tts | ✅ Available |
| Voice catalog | `/api/voices` (new) | edge-tts | ⚠️ Need to add |

### 5.2 New Endpoint Required: Voice Catalog

**Add to edge-tts container** (`@G:\github\VPS3\containers\edge-tts\edge-tts-server.py`):

```python
@app.get("/api/voices")
async def get_voices():
    """Return catalog of available TTS voices for PixelPaw"""
    return {
        "voices": [
            {"id": "bf_emma", "name": "Emma", "gender": "female", "accent": "british"},
            {"id": "bm_george", "name": "George", "gender": "male", "accent": "british"},
            {"id": "af_bella", "name": "Bella", "gender": "female", "accent": "american"},
            {"id": "am_adam", "name": "Adam", "gender": "male", "accent": "american"},
            # ... (all 22 Kokoro voices)
        ]
    }
```

### 5.3 CORS Configuration

**Ensure NGINX allows PixelPaw origin** (VS Code webview runs from `vscode-webview://...`):

```nginx
# In nginx/daveai.tech.conf
location /api {
    # Allow VS Code webview origin
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    
    if ($request_method = OPTIONS) {
        return 204;
    }
    
    proxy_pass http://agent-brain:8888;
}
```

---

## 6. USER WORKFLOW

### Installation Flow

1. User visits `https://daveai.tech`
2. Clicks "Extensions" → "PixelPaw for VS Code"
3. Downloads `pixelpaw-1.3.0.vsix`
4. Installs in VS Code:
   ```bash
   code --install-extension pixelpaw-1.3.0.vsix
   ```
5. Opens PixelPaw panel in VS Code (sidebar icon)
6. Extension auto-connects to `https://daveai.tech/api`
7. Characters appear, user can chat with agents

### Configuration (Optional)

PixelPaw respects `.pixelpaw.yaml` in workspace root:

```yaml
# .pixelpaw.yaml
daveai:
  baseUrl: https://daveai.tech
  agentBrainUrl: https://daveai.tech/api
  ttsUrl: https://daveai.tech
  defaultAgent: Alice
```

If user runs a **local daveai.tech dev instance**, they can override:

```yaml
daveai:
  baseUrl: http://localhost
  agentBrainUrl: http://localhost:8888/api
  ttsUrl: http://localhost:5050
```

---

## 7. DEVELOPMENT WORKFLOW

### Local Development (PixelPaw + VPS3)

```bash
# Terminal 1: Start VPS3 containers
cd G:\github\VPS3
docker compose up

# Terminal 2: Develop PixelPaw
cd G:\github\PixelPaw
npm install
cd webview-ui && npm install && cd ..
npm run watch  # Hot reload

# Terminal 3: Test extension
code --extensionDevelopmentPath=G:\github\PixelPaw
```

PixelPaw will connect to `http://localhost/api` (VPS3 nginx gateway).

### Production Build

```bash
# Build and push to VPS
cd G:\github\VPS3
docker compose build pixelpaw-builder
docker compose up -d pixelpaw-builder

# Extension now available at:
# https://daveai.tech/downloads/pixelpaw.vsix
```

---

## 8. DEPLOYMENT CHECKLIST

- [ ] Create `G:\github\VPS3\containers\pixelpaw-builder\` directory
- [ ] Write `Dockerfile` for PixelPaw builder
- [ ] Add `pixelpaw-builder` service to `docker-compose.yml`
- [ ] Add `/downloads` and `/pixelpaw/docs` routes to nginx config
- [ ] Add voice catalog endpoint to edge-tts container
- [ ] Configure CORS for VS Code webview origin
- [ ] Create download/docs section on daveai.tech frontend
- [ ] Test full flow: download → install → connect → chat → TTS
- [ ] Document PixelPaw setup in main README
- [ ] Add PixelPaw demo video/screenshot to frontend

---

## 9. AUTO-UPDATE STRATEGY

### Automated Builds on Git Push

```yaml
# G:\github\PixelPaw\.github\workflows\build-vsix.yml
name: Build VSIX
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install && cd webview-ui && npm install
      - run: npm run package
      - uses: actions/upload-artifact@v3
        with:
          name: pixelpaw.vsix
          path: '*.vsix'
```

### VPS3 Integration

Add webhook listener in `pixelpaw-builder` container:
- Listen for GitHub release webhooks
- Auto-pull latest `.vsix` from GitHub Releases
- Serve updated version at `/downloads/pixelpaw.vsix`

---

## 10. MONITORING & ANALYTICS

### Container Metrics

Track in `pixelpaw-builder` container:
- Download count (`/downloads/pixelpaw.vsix` hits)
- Version distribution (which `.vsix` versions are downloaded)
- API connection health (successful `/api/chat` calls from PixelPaw)

### User Feedback Loop

Add to PixelPaw extension:
- "Report Issue" → opens GitHub issue with auto-populated diagnostics
- "Health Check" command → tests connection to all daveai.tech endpoints
- Usage analytics (opt-in): agent spawns, chat messages, voice synthesis calls

---

## 11. SECURITY CONSIDERATIONS

### API Authentication

**Current**: PixelPaw uses JWT tokens from daveai.tech login  
**Enhancement**: Add extension-specific API keys

```typescript
// In PixelPaw daveaiBridge.ts
const API_KEY = vscode.workspace.getConfiguration('pixelpaw').get('apiKey');
headers['X-PixelPaw-API-Key'] = API_KEY;
```

**Agent Brain validation**:
```python
# In brain_api.py
@app.middleware("http")
async def validate_pixelpaw_key(request, call_next):
    if request.headers.get("X-PixelPaw-API-Key"):
        # Validate key in DB
        # Rate-limit per key
        pass
    return await call_next(request)
```

### Rate Limiting

Add to nginx config:
```nginx
# Limit PixelPaw API calls to 100/minute per IP
limit_req_zone $binary_remote_addr zone=pixelpaw:10m rate=100r/m;

location /api {
    limit_req zone=pixelpaw burst=20 nodelay;
    # ...
}
```

---

## 12. MODULAR ADD-ON PATTERN

PixelPaw demonstrates the **add-on pattern** for VPS3:

```
daveai.tech (core ecosystem)
     │
     ├─ Frontend Container
     ├─ Agent Brain Container
     ├─ TTS Container
     │
     └─ Add-ons (externally installed, API-connected)
          ├─ PixelPaw (VS Code extension)
          ├─ MobileApp (future: iOS/Android app)
          ├─ Discord Bot (future: Discord integration)
          └─ Browser Extension (future: Chrome/Firefox)
```

**Key principle**: Add-ons are **not containers**, they are **API clients**.  
VPS3 provides the API gateway; add-ons connect from anywhere.

---

## 13. SUMMARY

| Component | Type | Location | Purpose |
|---|---|---|---|
| **PixelPaw** | VS Code Extension | `G:\github\PixelPaw` | Client-side UI for agents |
| **pixelpaw-builder** | Docker Container | VPS3 ecosystem | Builds + serves .vsix |
| **Downloads endpoint** | Nginx route | `/downloads/pixelpaw.vsix` | Public download link |
| **API gateway** | Nginx + CORS | `/api/*` | Proxies to agent-brain |
| **Voice catalog** | New endpoint | edge-tts `/api/voices` | Lists available voices |

**Integration Status**: ✅ **Ready to containerize**  
PixelPaw already has daveai.tech hardcoded as the default API endpoint.  
Only need to add the builder container + download page.
