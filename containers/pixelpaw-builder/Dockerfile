FROM node:20-alpine

LABEL maintainer="daveai.tech"
LABEL description="PixelPaw Extension Builder - Automated .vsix build and distribution"

WORKDIR /build

# Install build tools
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    curl

# Install vsce (VS Code Extension Manager)
RUN npm install -g @vscode/vsce

# Install simple HTTP server
RUN npm install -g serve

# Create output directory
RUN mkdir -p /app/public /app/docs

# Copy build script
COPY build-extension.sh /build/
RUN chmod +x /build/build-extension.sh

# Health check
HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8085/ || exit 1

EXPOSE 8085

CMD ["/build/build-extension.sh"]
