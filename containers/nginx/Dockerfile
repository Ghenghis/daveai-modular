FROM nginx:alpine

LABEL maintainer="daveai.tech"
LABEL description="DaveAI Nginx Gateway - Reverse Proxy & SSL"

# Install curl and certbot for SSL
RUN apk add --no-cache \
    curl \
    certbot \
    certbot-nginx

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy main nginx.conf (replaces system default)
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy site config
COPY daveai.tech.conf /etc/nginx/conf.d/daveai.tech.conf

# Create SSL directory
RUN mkdir -p /etc/letsencrypt

# Create health check endpoint
RUN echo 'server { listen 80; location /health { return 200 "OK\n"; add_header Content-Type text/plain; } }' \
    > /etc/nginx/conf.d/health.conf

EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
