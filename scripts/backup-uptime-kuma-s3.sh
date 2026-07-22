#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/club-pwa-backup}"
STATUS_FILE="$STATE_DIR/kuma.env"
temp_dir="$(mktemp -d /tmp/club-pwa-kuma-backup.XXXXXX)"
file_name="uptime-kuma-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
kuma_stopped=0

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
  if [[ "$kuma_stopped" == "1" ]]; then
    (cd "$DEPLOY_DIR" && docker compose -f docker-compose.prod.yml start uptime-kuma) >/dev/null 2>&1 || true
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
docker compose -f docker-compose.prod.yml stop -t 20 uptime-kuma
kuma_stopped=1
docker run --rm --volumes-from "$container_id" -v "$temp_dir:/backup" \
  --entrypoint tar caddy:2-alpine -czf "/backup/$file_name" -C /app/data .
docker compose -f docker-compose.prod.yml start uptime-kuma
kuma_stopped=0
test -s "$temp_dir/$file_name"

result="$(docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$temp_dir:/operational-backup:ro" \
  api bun apps/api/src/storage/uploadOperationalBackup.ts "/operational-backup/$file_name" uptime-kuma)"
write_status success "$(printf '%s\n' "$result" | tail -n 1)"
