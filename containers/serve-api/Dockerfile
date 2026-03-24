FROM python:3.11-slim

LABEL maintainer="daveai.tech"
LABEL description="DaveAI Serve API - Games List Endpoint"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install FastAPI
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard]

# Copy serve script
COPY serve-api/serve.py .

EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8090/api/games || exit 1

# Start server
CMD ["python", "serve.py"]
