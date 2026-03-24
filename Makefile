# ═══════════════════════════════════════════════════════════
#  DaveAI.tech VPS3 — Makefile
# ═══════════════════════════════════════════════════════════

.PHONY: help setup build up down restart logs ps health backup restore clean

help:
	@echo "DaveAI.tech VPS3 Commands:"
	@echo ""
	@echo "  make setup      - Initial setup (copy .env templates)"
	@echo "  make build      - Build all Docker containers"
	@echo "  make up         - Start all services"
	@echo "  make down       - Stop all services"
	@echo "  make restart    - Restart all services"
	@echo "  make logs       - View logs from all services"
	@echo "  make ps         - Show running containers"
	@echo "  make health     - Check health of all services"
	@echo "  make backup     - Trigger manual backup"
	@echo "  make restore    - Restore from latest backup"
	@echo "  make clean      - Stop and remove all containers/volumes"
	@echo ""

setup:
	@echo "Setting up environment files..."
	@mkdir -p shared/secrets
	@if [ ! -f shared/secrets/.env.brain ]; then \
		cp shared/secrets/.env.brain.example shared/secrets/.env.brain; \
		echo "Created shared/secrets/.env.brain - EDIT THIS FILE!"; \
	fi
	@if [ ! -f shared/secrets/.env.litellm ]; then \
		cp shared/secrets/.env.litellm.example shared/secrets/.env.litellm; \
		echo "Created shared/secrets/.env.litellm - EDIT THIS FILE!"; \
	fi
	@echo "✓ Setup complete. Edit .env files in shared/secrets/"

build:
	@echo "Building Docker containers..."
	docker compose build --no-cache

up:
	@echo "Starting all services..."
	docker compose up -d
	@echo "✓ Services started. Use 'make logs' to view output."

down:
	@echo "Stopping all services..."
	docker compose down

restart:
	@echo "Restarting all services..."
	docker compose restart

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

health:
	@echo "Checking service health..."
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "Testing endpoints..."
	@curl -sf http://localhost/health && echo "✓ Nginx: OK" || echo "✗ Nginx: FAIL"
	@curl -sf http://localhost/ && echo "✓ Frontend: OK" || echo "✗ Frontend: FAIL"
	@curl -sf http://localhost/api/health && echo "✓ Agent Brain: OK" || echo "✗ Agent Brain: FAIL"
	@curl -sf http://localhost/api/tts -H "Content-Type: application/json" -d '{"text":"test"}' > /dev/null 2>&1 && echo "✓ TTS: OK" || echo "✗ TTS: FAIL"

backup:
	@echo "Triggering manual backup..."
	docker compose exec backup-agent /app/backup.sh

restore:
	@echo "Restoring from latest backup..."
	@./scripts/restore.sh

clean:
	@echo "⚠️  WARNING: This will remove ALL containers and volumes!"
	@read -p "Are you sure? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		docker compose down -v; \
		echo "✓ Cleaned up"; \
	else \
		echo "Cancelled"; \
	fi

# Quick shortcuts
build-brain:
	docker compose build agent-brain

build-frontend:
	docker compose build frontend

logs-brain:
	docker compose logs -f agent-brain

logs-nginx:
	docker compose logs -f nginx

logs-tts:
	docker compose logs -f edge-tts
