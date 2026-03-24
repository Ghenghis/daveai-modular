#!/bin/bash
cd /opt/agent-brain
source venv/bin/activate
exec python3 edge-tts-server.py
