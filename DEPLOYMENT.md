# Production Deployment Guide — VPS3 to daveai.tech

Deploy the modular Docker ecosystem to production VPS.

---

## Prerequisites

- **VPS**: Ubuntu 22.04+ with root access (187.77.30.206)
- **Domain**: daveai.tech DNS access
- **Local**: Docker, Git, SSH configured
- **Tested locally**: Complete QUICKSTART.md first

---

## Deployment Overview

```
Local Machine (G:\github\VPS3)
    │
    ├─ Build & test locally
    ├─ Push to GitHub (optional)
    │
    └─ Deploy via SSH/rsync
         │
         ▼
VPS (187.77.30.206)
    │
    ├─ Pull/sync files → /opt/daveai-vps3
    ├─ Install Docker + Docker Compose
    ├─ Configure .env files
    ├─ Build containers
    ├─ Start services
    ├─ Setup SSL (certbot)
    │
    └─ Update DNS → daveai.tech points to VPS
```

---

## Step 1: Prepare VPS

### SSH into VPS

```bash
ssh root@187.77.30.206
```

Password: `VlxzM6&f3zOPf5,Da8S-ejI;fSv,ctVdYD;7c8&Q` (from env/.env.ssh)

### Install Docker

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Start Docker
systemctl enable docker
systemctl start docker

# Verify
docker --version
```

### Install Docker Compose

```bash
# Create plugin directory
mkdir -p ~/.docker/cli-plugins

# Download Docker Compose
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o ~/.docker/cli-plugins/docker-compose

# Make executable
chmod +x ~/.docker/cli-plugins/docker-compose

# Verify
docker compose version
```

### Stop Old Services (if running)

```bash
# Stop PM2 processes
pm2 stop all
pm2 save

# Stop nginx (old)
systemctl stop nginx
systemctl disable nginx

# Free up ports
netstat -tulpn | grep -E ':(80|443|8888|5050)'
```

---

## Step 2: Deploy Files to VPS

### Option A: Automated Deployment (Recommended)

From your **local machine** (Windows):

```bash
cd G:\github\VPS3

# Make script executable (Git Bash or WSL)
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

This will:
- Rsync files to VPS
- Install Docker if needed
- Build containers
- Start services

### Option B: Manual Deployment

```bash
# From local machine
cd G:\github\VPS3

# Sync files to VPS
rsync -avz --exclude='.git' \
           --exclude='node_modules' \
           --exclude='shared/secrets/.env.*' \
           --exclude='!shared/secrets/.env.*.example' \
           ./ root@187.77.30.206:/opt/daveai-vps3/
```

---

## Step 3: Configure Environment Variables

### SSH to VPS

```bash
ssh root@187.77.30.206
cd /opt/daveai-vps3
```

### Create .env files

```bash
# Copy templates
cp shared/secrets/.env.brain.example shared/secrets/.env.brain
cp shared/secrets/.env.litellm.example shared/secrets/.env.litellm
```

### Edit .env.brain

```bash
nano shared/secrets/.env.brain
```

**Required changes**:
```bash
# Security - CRITICAL!
JWT_SECRET=GENERATE_STRONG_64_CHAR_RANDOM_STRING_HERE
ADMIN_EMAIL=your-email@daveai.tech

# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-YOUR_REAL_KEY
OPENAI_API_KEY=sk-YOUR_REAL_KEY
OPENROUTER_API_KEY=sk-or-YOUR_REAL_KEY

# Site
SITE_URL=https://daveai.tech

# Database (keep default)
DATABASE_URL=sqlite:////app/data/daveai.db
```

**Generate strong JWT secret**:
```bash
openssl rand -hex 32
```

### Edit .env.litellm

```bash
nano shared/secrets/.env.litellm
```

**Add your API keys**:
```bash
OPENROUTER_API_KEY=sk-or-YOUR_REAL_KEY
ANTHROPIC_API_KEY=sk-ant-YOUR_REAL_KEY
OPENAI_API_KEY=sk-YOUR_REAL_KEY
GROQ_API_KEY=gsk_YOUR_REAL_KEY
```

---

## Step 4: Build and Start Services

```bash
cd /opt/daveai-vps3

# Build all containers (takes 5-10 min)
docker compose build

# Start services
docker compose up -d

# Watch logs
docker compose logs -f
```

### Verify Services

```bash
# Check status
docker compose ps

# Should see all containers as "Up (healthy)"
```

### Test Endpoints (from VPS)

```bash
# Frontend
curl http://localhost/

# API
curl http://localhost/api/health

# TTS
curl -X POST http://localhost/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"test","voice":"bf_emma"}'
```

---

## Step 5: Configure Firewall

```bash
# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow SSH (important!)
ufw allow 22/tcp

# Enable firewall
ufw enable

# Verify
ufw status
```

---

## Step 6: Setup SSL (Let's Encrypt)

### Install Certbot (inside nginx container)

```bash
docker compose exec nginx certbot --nginx -d daveai.tech -d www.daveai.tech
```

**Follow prompts**:
- Email: your-email@daveai.tech
- Agree to terms: Yes
- Share email: Optional
- Redirect HTTP to HTTPS: Yes (recommended)

### Auto-renewal

Certbot auto-renews. Test renewal:
```bash
docker compose exec nginx certbot renew --dry-run
```

### Update nginx config for HTTPS

Edit `containers/nginx/daveai.tech.conf` to uncomment HTTPS redirect block:

```nginx
# Uncomment this block:
server {
    listen 80;
    server_name daveai.tech www.daveai.tech;
    return 301 https://$server_name$request_uri;
}
```

Restart nginx:
```bash
docker compose restart nginx
```

---

## Step 7: Configure DNS

### Update A Records

In your DNS provider (Cloudflare/Namecheap/etc.):

| Type | Name | Value | TTL |
|---|---|---|---|
| A | @ | 187.77.30.206 | 300 |
| A | www | 187.77.30.206 | 300 |

### Wait for Propagation

```bash
# Check from local machine
nslookup daveai.tech

# Should return: 187.77.30.206
```

Propagation takes **5-60 minutes**.

---

## Step 8: Verify Production

### Test HTTPS

Visit **https://daveai.tech** in browser:
- ✅ Should load website
- ✅ Green padlock (valid SSL)
- ✅ Chat interface works
- ✅ Voice Studio works
- ✅ Login/register functional

### Test API Endpoints

```bash
# From local machine
curl https://daveai.tech/api/health
curl https://daveai.tech/downloads/pixelpaw.vsix -I
```

### Test PixelPaw Integration

```bash
# Download PixelPaw
curl -O https://daveai.tech/downloads/pixelpaw.vsix

# Install in VS Code
code --install-extension pixelpaw.vsix
```

Open PixelPaw in VS Code → should connect to daveai.tech API.

---

## Step 9: Monitoring & Maintenance

### View Logs

```bash
cd /opt/daveai-vps3

# All services
docker compose logs -f

# Specific service
docker compose logs -f agent-brain

# Last 100 lines
docker compose logs --tail=100 agent-brain
```

### Check Resource Usage

```bash
# All containers
docker stats

# Specific container
docker stats daveai-brain
```

### Backup Database

```bash
# Manual backup
docker compose exec backup-agent /app/backup.sh

# List backups
ls -lh /opt/daveai-vps3/backups/

# Backups run automatically every 6 hours
```

### Update Services

```bash
cd /opt/daveai-vps3

# Pull latest changes
git pull  # If using GitHub

# Or rsync from local
# (from local machine)
./scripts/deploy.sh

# Rebuild and restart
docker compose build
docker compose up -d
```

---

## Step 10: Rollback Plan

### If Deployment Fails

```bash
# Stop new containers
cd /opt/daveai-vps3
docker compose down

# Restore old PM2 services
pm2 resurrect
pm2 restart all
```

### Restore from Backup

```bash
# Stop services
docker compose down

# Restore brain-data volume
./scripts/restore.sh

# Or manually:
cd backups
tar xzf brain-backup-TIMESTAMP.tar.gz -C /opt/daveai-vps3/volumes/brain-data/

# Restart
docker compose up -d
```

---

## Troubleshooting

### Container Won't Start

```bash
# View logs
docker compose logs <service-name>

# Rebuild
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

### Database Locked

```bash
# Stop all
docker compose down

# Remove lock files
docker volume inspect vps3_brain-data
# Find mount point, then:
rm /var/lib/docker/volumes/vps3_brain-data/_data/*.db-wal
rm /var/lib/docker/volumes/vps3_brain-data/_data/*.db-shm

# Restart
docker compose up -d
```

### Port Conflicts

```bash
# Check what's using ports
netstat -tulpn | grep -E ':(80|443|8888)'

# Kill process or change ports in docker-compose.yml
```

### SSL Certificate Renewal Failed

```bash
# Check nginx config
docker compose exec nginx nginx -t

# Manual renewal
docker compose exec nginx certbot renew --force-renewal

# Check certificate expiry
docker compose exec nginx certbot certificates
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -a --volumes

# Keep only last 3 backups
cd /opt/daveai-vps3/backups
ls -t *.tar.gz | tail -n +4 | xargs rm -f
```

---

## Performance Tuning

### Increase Container Memory

Edit `docker-compose.yml`:
```yaml
services:
  agent-brain:
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

### Enable Gzip in Nginx

Already enabled in `containers/nginx/daveai.tech.conf`.

### Add Redis Caching (Optional)

Add Redis service to `docker-compose.yml` and configure agent-brain to use it.

---

## Security Checklist

- [x] Firewall configured (only 22, 80, 443 open)
- [x] SSL certificates installed
- [x] .env files not in git
- [x] Strong JWT secret (64+ chars)
- [x] Database not publicly accessible
- [x] API rate limiting enabled
- [x] CORS configured for PixelPaw
- [x] Automated backups running
- [ ] Setup monitoring (optional: Uptime Robot, Datadog)
- [ ] Setup error tracking (optional: Sentry)

---

## Next Steps

1. **Monitor** for 24-48 hours, check logs for errors
2. **Test** all features (chat, voice, admin panel, PixelPaw)
3. **Backup** before making changes
4. **Document** any custom configurations
5. **Setup** monitoring/alerting (optional)
6. **Plan** future modular expansions (see PIXELPAW_INTEGRATION.md)

---

## Support

If issues arise:
- Check logs: `docker compose logs -f`
- Review docs: README.md, QUICKSTART.md
- Restore from backup if needed
- Rollback to old PM2 setup if critical

---

## Production Checklist

Before going live:
- [ ] Local testing complete (QUICKSTART.md)
- [ ] VPS has Docker + Docker Compose
- [ ] .env files configured with real API keys
- [ ] All containers healthy (`docker compose ps`)
- [ ] SSL certificates installed
- [ ] DNS pointing to VPS
- [ ] Firewall configured
- [ ] Backups running
- [ ] Tested: chat, voice, login, API endpoints
- [ ] PixelPaw downloads working
- [ ] Old PM2 services stopped

**Ready to deploy? Run:**
```bash
./scripts/deploy.sh
```
