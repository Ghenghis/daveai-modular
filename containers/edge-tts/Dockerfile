FROM python:3.11-slim

LABEL maintainer="daveai.tech"
LABEL description="DaveAI Edge TTS - Voice Synthesis Server"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install edge-tts and FastAPI
RUN pip install --no-cache-dir \
    edge-tts \
    fastapi \
    uvicorn[standard] \
    pydantic \
    aiohttp

# Copy TTS server (renamed to valid Python module name)
COPY edge-tts/edge-tts-server.py ./tts_server.py

EXPOSE 5050

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:5050/api/health || exit 1

# Start server
CMD ["uvicorn", "tts_server:app", "--host", "0.0.0.0", "--port", "5050"]
