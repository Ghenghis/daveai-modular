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

# Copy TTS server
COPY edge-tts/edge-tts-server.py .

EXPOSE 5050

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:5050/api/health || exit 1

# Start server
CMD ["uvicorn", "edge-tts-server:app", "--host", "0.0.0.0", "--port", "5050"]
