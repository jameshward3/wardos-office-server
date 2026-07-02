#!/bin/bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-data/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
POSTGRES_DB="${POSTGRES_DB:-wardos}"
POSTGRES_USER="${POSTGRES_USER:-wardos}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="${BACKUP_DIR}/wardos_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"
docker exec wardos_postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_PATH"
shasum -a 256 "$BACKUP_PATH" > "${BACKUP_PATH}.sha256"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -type f \( -name "wardos_*.sql" -o -name "wardos_*.sql.sha256" \) -mtime +"$RETENTION_DAYS" -print -delete
fi

echo "Backup written to ${BACKUP_PATH}"
