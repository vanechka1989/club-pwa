#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${STORAGE_MAINTENANCE_STATE_DIR:-/var/lib/club-pwa-maintenance}"
STATUS_FILE="$STATE_DIR/storage.env"
LOCK_FILE="$STATE_DIR/storage.lock"

mkdir -p "$STATE_DIR"
chmod 0755 "$STATE_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

read_disk() {
  df -PB1 / | awk 'NR==2 {gsub(/%/, "", $5); print $2, $3, $4, $5}'
}

bounded_size() {
  printf '%s' "${1:-0B}" | tr -cd '[:alnum:].' | cut -c1-24
}

docker_size() {
  local type="$1"
  docker system df --format '{{.Type}}|{{.Size}}' 2>/dev/null \
    | awk -F'|' -v wanted="$type" '$1 == wanted { print $2; exit }'
}

total_bytes=0
used_bytes=0
free_bytes=0
used_percent=0
before_free_bytes=0
before_used_percent=0
reclaimed_bytes=0
mode="routine"
docker_images_size="0B"
docker_build_cache_size="0B"
system_log_bytes=0
app_bytes=0

write_status() {
  local status="$1"
  local error_code="${2:-}"
  local status_tmp
  status_tmp="$(mktemp "$STATE_DIR/storage.env.tmp.XXXXXX")"
  chmod 0644 "$status_tmp"
  {
    printf 'STATUS=%s\n' "$status"
    printf 'COMPLETED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'MODE=%s\n' "$mode"
    printf 'DISK_BEFORE_PERCENT=%s\n' "$before_used_percent"
    printf 'DISK_AFTER_PERCENT=%s\n' "$used_percent"
    printf 'DISK_TOTAL_BYTES=%s\n' "$total_bytes"
    printf 'DISK_FREE_BYTES=%s\n' "$free_bytes"
    printf 'RECLAIMED_BYTES=%s\n' "$reclaimed_bytes"
    printf 'DOCKER_IMAGES_SIZE=%s\n' "$docker_images_size"
    printf 'DOCKER_BUILD_CACHE_SIZE=%s\n' "$docker_build_cache_size"
    printf 'SYSTEM_LOG_BYTES=%s\n' "$system_log_bytes"
    printf 'APP_BYTES=%s\n' "$app_bytes"
    printf 'ERROR_CODE=%s\n' "$error_code"
  } > "$status_tmp"
  mv "$status_tmp" "$STATUS_FILE"
}

on_error() {
  local exit_code=$?
  trap - ERR
  write_status failure maintenance-command-failed || true
  exit "$exit_code"
}
trap on_error ERR

read -r total_bytes used_bytes free_bytes used_percent < <(read_disk)
before_free_bytes="$free_bytes"
before_used_percent="$used_percent"
if (( used_percent >= 70 )); then
  mode="pressure"
fi

docker builder prune -af --keep-storage 2GB >/dev/null
docker image prune -f --filter until=168h >/dev/null
journalctl --vacuum-size=150M >/dev/null
if command -v apt-get >/dev/null 2>&1; then
  apt-get clean
fi

read -r total_bytes used_bytes free_bytes used_percent < <(read_disk)
if (( free_bytes > before_free_bytes )); then
  reclaimed_bytes=$((free_bytes - before_free_bytes))
fi
docker_images_size="$(bounded_size "$(docker_size Images)")"
docker_build_cache_size="$(bounded_size "$(docker_size 'Build Cache')")"
system_log_bytes="$(du -sb /var/log 2>/dev/null | awk 'NR==1 {print $1+0}')"
app_bytes="$(du -sb "$DEPLOY_DIR" 2>/dev/null | awk 'NR==1 {print $1+0}')"

write_status success
