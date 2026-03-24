#!/bin/bash
cd /opt/agent-brain
exec ./venv/bin/uvicorn brain_api:app --host 0.0.0.0 --port 8888 --workers 1
