# DaveAI.tech VPS3 — Modular Docker Ecosystem

> **VPS2**: Clean 1:1 backup of current production site  
> **VPS3**: New modular Docker-based architecture with fault isolation

---

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Git
- `G:\github\PixelPaw` cloned (for PixelPaw builder container)

### Launch All Services

```bash
cd G:\github\VPS3

# Start all containers
docker compose up -d

# View logs
docker compose logs -f

# Check health
docker compose ps
```

### Access Services

| Service | URL | Purpose |
|---|---|---|
| **Frontend** | http://localhost | Main website |
| **Agent Brain API** | http://localhost/api | Backend API |
| **TTS** | http://localhost/api/tts | Voice synthesis |
| **PixelPaw Downloads** | http://localhost/downloads | Extension .vsix |
| **LiteLLM** | http://localhost:4000 | LLM router (internal) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NGINX (Gateway)                       │
│              SSL, Routing, Load Balancing                │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
       ┌───────┴────────┐         ┌───────┴────────┐
       │   FRONTEND     │         │  AGENT-BRAIN   │
       │   (static)     │         │   (FastAPI)    │
       │   :8080        │         │   :8888        │
       └────────────────┘         └────────┬───────┘
                                           │
                  ┌────────────────────────┼─────────────┐
                  │                        │             │
         ┌────────┴────────┐    ┌─────────┴──────┐  ┌──┴───────┐
         │    EDGE-TTS     │    │    LITELLM     │  │ SERVE-API│
         │    :5050        │    │    :4000       │  │  :8090   │
         └─────────────────┘    └────────────────┘  └──────────┘

         ┌─────────────────────────────────────────────────────┐
         │              PIXELPAW-BUILDER                       │
         │  Builds PixelPaw .vsix from G:/github/PixelPaw     │
         │  Serves at /downloads/pixelpaw.vsix                │
         └─────────────────────────────────────────────────────┘
```

---

## Container Details

### 1. nginx (Gateway)
- **Ports**: 80, 443
- **Role**: Reverse proxy, SSL termination, routing
- **Config**: `containers/nginx/daveai.tech.conf`

### 2. frontend (Static Site)
- **Port**: 8080 (internal)
- **Role**: Serves HTML/CSS/JS/videos
- **Source**: VPS2 frontend/ files

### 3. agent-brain (API Backend)
- **Port**: 8888 (internal)
- **Role**: All API logic (chat, auth, tools, DB)
- **Source**: VPS2 agent-brain/ Python files
- **Env**: `shared/secrets/.env.brain`

### 4. edge-tts (Voice Synthesis)
- **Port**: 5050 (internal)
- **Role**: TTS via edge-tts + Kokoro fallback
- **Source**: VPS2 edge-tts/

### 5. litellm (LLM Router)
- **Port**: 4000 (internal)
- **Role**: Route LLM calls with fallback/retry
- **Config**: `containers/litellm/config.yaml`
- **Env**: `shared/secrets/.env.litellm`

### 6. serve-api (Games API)
- **Port**: 8090 (internal)
- **Role**: Game carousel list endpoint
- **Source**: VPS2 serve-api/serve.py

### 7. agentic-ui (Next.js)
- **Port**: 3001 (internal)
- **Role**: Alternate React-based UI
- **Source**: VPS2 agentic-ui/

### 8. backup-agent
- **Role**: Auto-snapshot brain-data volume every 6h
- **Volume**: `backup-data:/backups`

### 9. pixelpaw-builder
- **Port**: 8085 (internal)
- **Role**: Build PixelPaw .vsix from source
- **Source**: `../../PixelPaw` (mounted read-only)

---

## Development

### Hot Reload (Dev Mode)

```yaml
# docker-compose.dev.yml
services:
  frontend:
    volumes:
      - ./containers/frontend:/app
  agent-brain:
    volumes:
      - ./containers/agent-brain:/app
    command: uvicorn brain_api:app --reload --host 0.0.0.0
```

Start with dev overrides:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Build Individual Container

```bash
docker compose build <service-name>
docker compose up -d <service-name>
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f agent-brain

# Last 100 lines
docker compose logs --tail=100 agent-brain
```

---

## Deployment

### To Production VPS

1. **Build locally** (test first):
   ```bash
   docker compose build
   docker compose up -d
   # Test at http://localhost
   ```

2. **Push images** (if using registry):
   ```bash
   docker compose push
   ```

3. **Deploy to VPS**:
   ```bash
   # SSH to VPS
   ssh root@187.77.30.206
   
   # Pull repo
   cd /opt
   git clone https://github.com/YOUR_USER/daveai-modular.git vps3
   cd vps3
   
   # Configure secrets
   cp shared/secrets/.env.brain.example shared/secrets/.env.brain
   nano shared/secrets/.env.brain  # Fill in secrets
   
   # Launch
   docker compose up -d
   ```

4. **Point DNS**:
   - Update A record: `daveai.tech` → `187.77.30.206`
   - Wait for propagation (~5 min)
   - Test `https://daveai.tech`

---

## Backup & Restore

### Manual Backup

```bash
# Backup brain database
docker compose exec agent-brain sqlite3 /app/data/daveai.db .dump > backup.sql

# Backup entire brain-data volume
docker run --rm -v vps3_brain-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/brain-data-$(date +%Y%m%d).tar.gz /data
```

### Restore from Backup

```bash
# Stop services
docker compose down

# Restore volume
docker run --rm -v vps3_brain-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/brain-data-20260323.tar.gz -C /

# Restart
docker compose up -d
```

### Auto-Backup (every 6h)

The `backup-agent` container automatically:
- Snapshots `brain-data` volume every 6 hours
- Keeps last 10 known-good snapshots
- Marks snapshot as "known-good" after health checks pass
- Restores last known-good on brain container crash

---

## Monitoring

### Health Checks

```bash
# Check all containers
docker compose ps

# Inspect specific container
docker inspect daveai-brain --format='{{.State.Health.Status}}'

# View health check logs
docker inspect daveai-brain --format='{{range .State.Health.Log}}{{.Output}}{{end}}'
```

### Resource Usage

```bash
# All containers
docker stats

# Specific container
docker stats daveai-brain
```

---

## Troubleshooting

### Container won't start

```bash
# View logs
docker compose logs <service-name>

# Check config
docker compose config

# Rebuild
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

### Database locked

```bash
# Stop all services
docker compose down

# Remove lock (if safe)
docker run --rm -v vps3_brain-data:/data alpine rm /data/daveai.db-wal /data/daveai.db-shm

# Restart
docker compose up -d
```

### Port conflicts

```bash
# Check what's using port 80
netstat -tulpn | grep :80

# Change ports in docker-compose.yml
ports:
  - "8080:80"  # Expose on 8080 instead
```

---

## Security

### Secrets Management

**DO NOT** commit `.env` files to git. Use templates:

```bash
# shared/secrets/.env.brain.example
JWT_SECRET=CHANGE_ME
ADMIN_EMAIL=admin@example.com
ANTHROPIC_API_KEY=sk-ant-CHANGE_ME
```

Copy and fill:
```bash
cp shared/secrets/.env.brain.example shared/secrets/.env.brain
nano shared/secrets/.env.brain
```

### Firewall Rules

```bash
# Allow only HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Block direct access to container ports
ufw deny 8080
ufw deny 8888
ufw deny 5050
```

### SSL Certificates

Let's Encrypt via nginx container:
```bash
docker compose exec nginx certbot --nginx -d daveai.tech -d www.daveai.tech
```

---

## CI/CD

### GitHub Actions Workflow

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to VPS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: 187.77.30.206
          username: root
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/vps3
            git pull
            docker compose build
            docker compose up -d
```

---

## Docs

- **[DAVEAI_SITE_AUDIT_AND_MODULAR_PLAN.md](docs/DAVEAI_SITE_AUDIT_AND_MODULAR_PLAN.md)** — Full audit + architecture
- **[PIXELPAW_INTEGRATION.md](docs/PIXELPAW_INTEGRATION.md)** — PixelPaw add-on pattern

---

## License

MIT — See LICENSE file
