FROM python:3.11-slim

LABEL maintainer="daveai.tech"
LABEL description="DaveAI LiteLLM - LLM Router with Fallback"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install LiteLLM
RUN pip install --no-cache-dir \
    'litellm[proxy]' \
    pyyaml

# Copy config
COPY litellm/config.yaml .

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:4000/v1/models || exit 1

# Start LiteLLM proxy
CMD ["litellm", "--config", "config.yaml", "--port", "4000", "--host", "0.0.0.0"]
