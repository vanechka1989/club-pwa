#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/club-pwa-backup}"
STATUS_FILE="$STATE_DIR/kuma.env"
temp_dir="$(mktemp -d /tmp/club-pwa-kuma-backup.XXXXXX)"
file_name="uptime-kuma-$(date -u +%Y%m%dT%H%M%SZ).db"
container_snapshot="/app/data/.club-pwa-kuma-backup-$$.db"
container_id=""

write_status() {
  local status="$1"
  local detail="${2:-}"
  mkdir -p "$STATE_DIR"
  local status_temp
  status_temp="$(mktemp "$STATE_DIR/.kuma.env.XXXXXX")"
  printf 'STATUS=%s\nTIMESTAMP=%s\nDETAIL=%q\n' "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$detail" > "$status_temp"
  chmod 0600 "$status_temp"
  mv "$status_temp" "$STATUS_FILE"
}

cleanup() {
  if [[ -n "$container_id" ]]; then
    docker exec "$container_id" rm -f "$container_snapshot" >/dev/null 2>&1 || true
  fi
  if [[ "$temp_dir" == /tmp/club-pwa-kuma-backup.* ]]; then
    rm -rf -- "$temp_dir"
  else
    echo "Refusing to remove unexpected temporary path: $temp_dir" >&2
  fi
}
trap cleanup EXIT

on_error() {
  local exit_code=$?
  write_status failed "Kuma backup failed with exit code $exit_code"
  exit "$exit_code"
}
trap on_error ERR

cd "$DEPLOY_DIR"
container_id="$(docker compose -f docker-compose.prod.yml ps -q uptime-kuma)"
test -n "$container_id"
docker exec "$container_id" sqlite3 /app/data/kuma.db ".backup '$container_snapshot'"
docker cp "$container_id:$container_snapshot" "$temp_dir/$file_name"
test -s "$temp_dir/$file_name"

result="$(docker compose -f docker-compose.prod.yml run --rm --no-deps --user 0:0 \
  -v "$temp_dir:/operational-backup:ro" \
  api bun apps/api/src/storage/uploadOperationalBackup.ts "/operational-backup/$file_name" uptime-kuma)"
write_status success "$(printf '%s\n' "$result" | tail -n 1)"
