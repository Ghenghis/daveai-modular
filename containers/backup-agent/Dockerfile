FROM alpine:latest

LABEL maintainer="daveai.tech"
LABEL description="DaveAI Backup Agent - Automated DB Snapshots"

WORKDIR /app

# Install required tools
RUN apk add --no-cache \
    sqlite \
    bash \
    tar \
    gzip \
    curl \
    aws-cli

# Copy backup script
COPY backup.sh /app/backup.sh
RUN chmod +x /app/backup.sh

# Create backup directory
RUN mkdir -p /backups

# Run backup every 6 hours
CMD ["/bin/sh", "-c", "while true; do /app/backup.sh; sleep 21600; done"]
