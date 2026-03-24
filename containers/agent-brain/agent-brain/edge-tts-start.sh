#!/bin/bash
# Pre-kill any stale process holding port 5050, then start edge-tts
fuser -k 5050/tcp 2>/dev/null
sleep 0.5
exec /opt/agent-brain/venv/bin/python /opt/agent-brain/edge-tts-server.py
