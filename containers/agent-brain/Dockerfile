FROM python:3.11-slim

LABEL maintainer="daveai.tech"
LABEL description="DaveAI Agent Brain - FastAPI Backend"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY agent-brain/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY agent-brain/ .

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV WORKSPACE=/app/data/workspace

# Create workspace directory
RUN mkdir -p $WORKSPACE

EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8888/api/health || exit 1

# Start server
CMD ["uvicorn", "brain_api:app", "--host", "0.0.0.0", "--port", "8888"]
