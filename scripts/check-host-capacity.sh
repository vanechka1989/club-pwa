#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${HOST_MONITOR_STATE_DIR:-/var/lib/club-pwa-monitor}"
STATE_FILE="$STATE_DIR/host-state"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
MEMORY_WARN_PERCENT="${MEMORY_WARN_PERCENT:-90}"
SERVICES=(postgres api web caddy uptime-kuma)
issues=()

disk_percent="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
memory_percent="$(awk '/MemTotal/ {total=$2} /MemAvailable/ {available=$2} END {printf "%.0f", (total-available)*100/total}' /proc/meminfo)"
load_one="$(awk '{print $1}' /proc/loadavg)"
cpu_count="$(getconf _NPROCESSORS_ONLN)"

(( disk_percent >= DISK_WARN_PERCENT )) && issues+=("disk=${disk_percent}%")
(( memory_percent >= MEMORY_WARN_PERCENT )) && issues+=("memory=${memory_percent}%")
if awk -v load="$load_one" -v cpus="$cpu_count" 'BEGIN {exit !(load > cpus * 2)}'; then
  issues+=("load=${load_one}")
fi

cd "$DEPLOY_DIR"
for service in "${SERVICES[@]}"; do
  container_id="$(docker compose -f docker-compose.prod.yml ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    issues+=("service:${service}=missing")
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
  [[ "$state" == running* ]] || issues+=("service:${service}=${state:-unknown}")
  [[ "$state" != *unhealthy* ]] || issues+=("service:${service}=unhealthy")
done

if ((${#issues[@]})); then
  detail="${issues[*]}"
  fingerprint="$(printf '%s' "$detail" | sha256sum | awk '{print $1}')"
  severity="warning"
else
  detail="All monitored host signals are healthy"
  fingerprint="healthy"
  severity="recovered"
fi

previous_fingerprint="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [[ "$fingerprint" == "$previous_fingerprint" || ( "$fingerprint" == "healthy" && -z "$previous_fingerprint" ) ]]; then
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$fingerprint" > "$STATE_FILE"
  exit 0
fi

docker compose -f docker-compose.prod.yml run --rm --no-deps api \
  bun apps/api/src/operations/sendOperationalAlert.ts "$severity" "$detail" >/dev/null
mkdir -p "$STATE_DIR"
printf '%s\n' "$fingerprint" > "$STATE_FILE"
