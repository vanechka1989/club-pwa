#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/club-pwa-backup}"
STATUS_FILE="$STATE_DIR/database.env"
cd "$DEPLOY_DIR"

write_status() {
  local status="$1"
  local detail="$2"
  local status_temp="$STATUS_FILE.tmp.$$"
  local finished_at
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$STATE_DIR"
  detail="$(printf '%s' "$detail" | tr '\r\n=' '   ' | cut -c1-500)"
  {
    printf 'STATUS=%s\n' "$status"
    printf 'FINISHED_AT=%s\n' "$finished_at"
    printf 'DETAIL=%s\n' "$detail"
  } > "$status_temp"
  chmod 600 "$status_temp"
  mv "$status_temp" "$STATUS_FILE"
}

on_error() {
  local exit_code=$?
  trap - ERR
  write_status failed "database backup exited with code $exit_code"
  exit "$exit_code"
}

trap on_error ERR

result="$(docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}" \
  api bun apps/api/src/db/runAutomaticBackup.ts)"
detail="$(printf '%s\n' "$result" | tail -n 1)"
write_status success "$detail"
printf '%s\n' "$detail"
