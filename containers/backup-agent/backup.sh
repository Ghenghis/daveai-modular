#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DATA_DIR="/data/brain"
MAX_BACKUPS=10

echo "[$(date)] Starting backup..."

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo "ERROR: Data directory $DATA_DIR not found"
    exit 1
fi

# Create backup filename
BACKUP_FILE="${BACKUP_DIR}/brain-backup-${TIMESTAMP}.tar.gz"

# Create backup
echo "Creating backup: $BACKUP_FILE"
tar czf "$BACKUP_FILE" -C "$DATA_DIR" . 2>/dev/null || {
    echo "ERROR: Backup failed"
    exit 1
}

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup created: $BACKUP_SIZE"

# Mark as known-good if we can verify DB integrity
if [ -f "$DATA_DIR/daveai.db" ]; then
    sqlite3 "$DATA_DIR/daveai.db" "PRAGMA integrity_check;" > /tmp/integrity.txt 2>&1
    if grep -q "ok" /tmp/integrity.txt; then
        touch "${BACKUP_FILE}.known-good"
        echo "Backup marked as known-good"
    fi
fi

# Cleanup old backups (keep last MAX_BACKUPS known-good backups)
echo "Cleaning up old backups..."
ls -t ${BACKUP_DIR}/*.known-good 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | while read marker; do
    BACKUP="${marker%.known-good}"
    echo "Removing old backup: $BACKUP"
    rm -f "$BACKUP" "$marker"
done

# Also remove orphaned backups (not marked as known-good) older than 24h
find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +1 ! -name "*.known-good" -delete

echo "[$(date)] Backup complete"

# Optional: Upload to S3/B2 if credentials provided
if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
    echo "Uploading to S3: $S3_BUCKET"
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/backups/" || echo "S3 upload failed (non-fatal)"
fi
