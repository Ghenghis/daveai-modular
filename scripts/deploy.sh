#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════
#  Deploy VPS3 to Production VPS
#  GitHub: https://github.com/Ghenghis/daveai-modular
# ═══════════════════════════════════════════════════════════

VPS_IP="187.77.30.206"
VPS_USER="root"
DEPLOY_PATH="/opt/daveai-vps3"
GITHUB_REPO="https://github.com/Ghenghis/daveai-modular.git"

echo "═══════════════════════════════════════════════════════════"
echo "  DaveAI VPS3 Deployment Script"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if SSH key exists
if [ ! -f ~/.ssh/id_rsa ]; then
    echo "⚠️  No SSH key found. You'll need to enter password."
    echo "   Consider setting up SSH keys for easier deployment."
fi

echo "→ Connecting to VPS: $VPS_IP"
echo ""

# Create deployment directory on VPS
ssh ${VPS_USER}@${VPS_IP} "mkdir -p $DEPLOY_PATH"

# Sync files to VPS (excluding .git, node_modules, etc.)
echo "→ Syncing files to VPS..."
rsync -avz --exclude='.git' \
           --exclude='node_modules' \
           --exclude='.next' \
           --exclude='__pycache__' \
           --exclude='*.pyc' \
           --exclude='shared/secrets/.env.*' \
           --exclude='!shared/secrets/.env.*.example' \
           ./ ${VPS_USER}@${VPS_IP}:${DEPLOY_PATH}/

echo ""
echo "→ Setting up environment on VPS..."

# SSH to VPS and set up
ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /opt/daveai-vps3

# Stop old PM2 services if running
pm2 stop all || true

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "Installing Docker Compose..."
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    mkdir -p $DOCKER_CONFIG/cli-plugins
    curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
        -o $DOCKER_CONFIG/cli-plugins/docker-compose
    chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
fi

# Setup environment files if they don't exist
if [ ! -f shared/secrets/.env.brain ]; then
    cp shared/secrets/.env.brain.example shared/secrets/.env.brain
    echo "⚠️  Created .env.brain - YOU MUST EDIT THIS FILE!"
fi

if [ ! -f shared/secrets/.env.litellm ]; then
    cp shared/secrets/.env.litellm.example shared/secrets/.env.litellm
    echo "⚠️  Created .env.litellm - YOU MUST EDIT THIS FILE!"
fi

# Build and start containers
echo "Building containers..."
docker compose build

echo "Starting services..."
docker compose up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 10

# Check health
docker compose ps

echo ""
echo "✓ Deployment complete!"
echo ""
echo "Services are starting. Check status with:"
echo "  docker compose ps"
echo "  docker compose logs -f"
echo ""
echo "⚠️  IMPORTANT: Edit these files on the VPS before going live:"
echo "  - /opt/daveai-vps3/shared/secrets/.env.brain"
echo "  - /opt/daveai-vps3/shared/secrets/.env.litellm"
echo ""

ENDSSH

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. SSH to VPS: ssh $VPS_USER@$VPS_IP"
echo "  2. Edit .env files in /opt/daveai-vps3/shared/secrets/"
echo "  3. Restart services: cd /opt/daveai-vps3 && docker compose restart"
echo "  4. Setup SSL: docker compose exec nginx certbot --nginx -d daveai.tech"
echo "  5. Point DNS A record to $VPS_IP"
echo ""
