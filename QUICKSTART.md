# Quick Start — Local Testing

Test the entire VPS3 ecosystem on your local machine before deploying to production.

---

## Prerequisites

- **Docker Desktop** installed and running
- **Git** installed
- **8GB RAM** minimum (containers will use ~2-3GB)
- **Ports available**: 80, 443, 3001, 4000, 5050, 8080, 8085, 8090, 8888

---

## Step 1: Setup Environment

```bash
cd G:\github\VPS3

# Copy environment templates
cp shared/secrets/.env.brain.example shared/secrets/.env.brain
cp shared/secrets/.env.litellm.example shared/secrets/.env.litellm
```

**Edit the files** (minimum required changes):

`shared/secrets/.env.brain`:
```bash
JWT_SECRET=local-dev-secret-change-in-production-12345678901234567890
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE  # Optional for testing
DATABASE_URL=sqlite:////app/data/daveai.db
```

`shared/secrets/.env.litellm`:
```bash
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE  # Optional
OPENAI_API_KEY=sk-YOUR_KEY_HERE  # Optional
```

> **Note**: API keys are optional for basic testing. The site will work without them (chat will fail gracefully).

---

## Step 2: Build Containers

```bash
docker compose build
```

This will take **5-10 minutes** on first build. Subsequent builds use cache and are faster.

**Expected output**:
```
[+] Building 45.2s (87/87) FINISHED
=> [nginx internal] load build definition
=> [frontend internal] load build definition
=> [agent-brain internal] load build definition
...
✓ Built successfully
```

---

## Step 3: Start Services

```bash
docker compose up -d
```

Services will start in dependency order. Wait ~30 seconds for all to be healthy.

**Check status**:
```bash
docker compose ps
```

**Expected output**:
```
NAME                    STATUS              PORTS
daveai-nginx            Up (healthy)        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
daveai-frontend         Up (healthy)        8080/tcp
daveai-brain            Up (healthy)        8888/tcp
daveai-tts              Up (healthy)        5050/tcp
daveai-litellm          Up (healthy)        4000/tcp
daveai-serve            Up (healthy)        8090/tcp
daveai-ui               Up (healthy)        3001/tcp
daveai-backup           Up                  
daveai-pixelpaw-builder Up (healthy)        8085/tcp
```

---

## Step 4: Test Endpoints

### Frontend
```bash
curl http://localhost/
# Should return HTML (daveai-ui-v6.html)
```

### API Health
```bash
curl http://localhost/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### TTS Server
```bash
curl -X POST http://localhost/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voice":"bf_emma"}'
# Should return audio data or voice catalog
```

### PixelPaw Downloads
```bash
curl http://localhost/downloads/
# Should return PixelPaw download page HTML
```

---

## Step 5: Open in Browser

Visit **http://localhost** — you should see the DaveAI website.

### Test Features:
- ✅ **Login/Register** (creates local SQLite user)
- ✅ **Chat interface** (will work even without API keys — uses fallback)
- ✅ **Voice Studio** (click voice icon, test TTS)
- ✅ **Admin Panel** (login as admin, view DB)
- ✅ **PixelPaw Download** (visit http://localhost/downloads)

---

## Step 6: View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f agent-brain

# Last 50 lines
docker compose logs --tail=50 agent-brain
```

---

## Common Issues & Fixes

### Port Already in Use

**Error**: `Bind for 0.0.0.0:80 failed: port is already allocated`

**Fix**: Stop whatever's using port 80 (IIS, Apache, etc.) or change ports:
```yaml
# docker-compose.yml
services:
  nginx:
    ports:
      - "8000:80"  # Use 8000 instead
```

Then access at http://localhost:8000

### Container Unhealthy

**Check logs**:
```bash
docker compose logs <service-name>
```

**Common causes**:
- Missing .env file → copy from .example
- Port conflict → check with `netstat -ano | findstr :8888`
- Build failed → try `docker compose build --no-cache <service-name>`

### Database Locked

**Symptoms**: Chat/login fails with "database is locked"

**Fix**:
```bash
docker compose down
docker volume rm vps3_brain-data  # Deletes DB, starts fresh
docker compose up -d
```

### PixelPaw Build Failed

**Symptoms**: `daveai-pixelpaw-builder` shows unhealthy

**Fix**: Make sure `G:\github\PixelPaw` exists and has all dependencies:
```bash
cd G:\github\PixelPaw
npm install
cd webview-ui
npm install
```

Then rebuild:
```bash
docker compose build pixelpaw-builder
docker compose up -d pixelpaw-builder
```

---

## Stop Services

```bash
# Stop (keeps data)
docker compose down

# Stop and remove volumes (deletes DB)
docker compose down -v
```

---

## Makefile Commands

```bash
make help       # Show all commands
make setup      # Copy .env templates
make build      # Build all containers
make up         # Start services
make down       # Stop services
make logs       # View logs
make health     # Check service health
make backup     # Trigger manual backup
```

---

## Next Steps

Once local testing is successful:

1. **Review** `DEPLOYMENT.md` for VPS deployment
2. **Edit** production .env files with real API keys
3. **Run** `./scripts/deploy.sh` to push to VPS
4. **Configure** SSL with Let's Encrypt
5. **Point** DNS to VPS IP

---

## Cleanup

Remove everything (containers, volumes, images):
```bash
docker compose down -v --rmi all
```
