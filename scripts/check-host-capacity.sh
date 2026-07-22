#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${HOST_MONITOR_STATE_DIR:-/var/lib/club-pwa-monitor}"
STATE_FILE="$STATE_DIR/host-state"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-70}"
DISK_CRITICAL_PERCENT="${DISK_CRITICAL_PERCENT:-85}"
DISK_EMERGENCY_PERCENT="${DISK_EMERGENCY_PERCENT:-92}"
MEMORY_AVAILABLE_WARN_MB="${MEMORY_AVAILABLE_WARN_MB:-256}"
MEMORY_AVAILABLE_CRITICAL_MB="${MEMORY_AVAILABLE_CRITICAL_MB:-128}"
SWAP_WARN_PERCENT="${SWAP_WARN_PERCENT:-50}"
SWAP_CRITICAL_PERCENT="${SWAP_CRITICAL_PERCENT:-80}"
SERVICES=(postgres api web caddy uptime-kuma)
issue_codes=()
issue_details=()
severity="warning"

raise_severity() {
  local candidate="$1"
  if [[ "$candidate" == "emergency" || ( "$candidate" == "critical" && "$severity" == "warning" ) ]]; then
    severity="$candidate"
  fi
}

add_issue() {
  issue_codes+=("$1")
  issue_details+=("$2")
  raise_severity "$3"
}

disk_percent="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
if (( disk_percent >= DISK_EMERGENCY_PERCENT )); then
  add_issue disk-emergency "Диск заполнен на ${disk_percent}%" emergency
elif (( disk_percent >= DISK_CRITICAL_PERCENT )); then
  add_issue disk-critical "Диск заполнен на ${disk_percent}%" critical
elif (( disk_percent >= DISK_WARN_PERCENT )); then
  add_issue disk-warning "Диск заполнен на ${disk_percent}%" warning
fi

memory_available_mb="$(awk '/MemAvailable/ {printf "%.0f", $2 / 1024}' /proc/meminfo)"
if (( memory_available_mb < MEMORY_AVAILABLE_CRITICAL_MB )); then
  add_issue memory-critical "Доступно памяти ${memory_available_mb} МБ" critical
elif (( memory_available_mb < MEMORY_AVAILABLE_WARN_MB )); then
  add_issue memory-warning "Доступно памяти ${memory_available_mb} МБ" warning
fi

read -r swap_total_kb swap_free_kb < <(awk '/SwapTotal/ {total=$2} /SwapFree/ {free=$2} END {print total+0, free+0}' /proc/meminfo)
swap_used_percent=0
if (( swap_total_kb > 0 )); then
  swap_used_percent=$(( (swap_total_kb - swap_free_kb) * 100 / swap_total_kb ))
fi
if (( swap_used_percent >= SWAP_CRITICAL_PERCENT )); then
  add_issue swap-critical "Swap использован на ${swap_used_percent}%" critical
elif (( swap_used_percent >= SWAP_WARN_PERCENT )); then
  add_issue swap-warning "Swap использован на ${swap_used_percent}%" warning
fi

cd "$DEPLOY_DIR"
for service in "${SERVICES[@]}"; do
  container_id="$(docker compose -f docker-compose.prod.yml ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    add_issue "service-${service}-missing" "Контейнер ${service} отсутствует" critical
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.OOMKilled}}|{{.RestartCount}}' "$container_id" 2>/dev/null || true)"
  IFS='|' read -r status health OOMKilled RestartCount <<< "$state"
  [[ "$status" == "running" ]] || add_issue "service-${service}-stopped" "${service}: состояние ${status:-unknown}" critical
  [[ "$health" != "unhealthy" ]] || add_issue "service-${service}-unhealthy" "${service}: healthcheck не проходит" critical
  [[ "$OOMKilled" != "true" ]] || add_issue "service-${service}-oom" "${service}: остановлен из-за нехватки памяти" emergency
  if (( ${RestartCount:-0} > 0 )); then
    add_issue "service-${service}-restarted" "${service}: перезапусков ${RestartCount}" warning
  fi
done

if ((${#issue_codes[@]})); then
  fingerprint="$(printf '%s\n' "${issue_codes[@]}" | sort -u | sha256sum | awk '{print $1}')"
  detail="$(IFS='; '; printf '%s' "${issue_details[*]}")"
else
  fingerprint="healthy"
  detail="Все контролируемые показатели сервера в норме"
  severity="recovered"
fi

mkdir -p "$STATE_DIR"
previous_fingerprint="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [[ "$fingerprint" == "$previous_fingerprint" || ( "$fingerprint" == "healthy" && -z "$previous_fingerprint" ) ]]; then
  printf '%s\n' "$fingerprint" > "$STATE_FILE"
  exit 0
fi

docker compose -f docker-compose.prod.yml run --rm --no-deps api \
  bun apps/api/src/operations/sendOperationalAlert.ts "$severity" "$detail" >/dev/null
printf '%s\n' "$fingerprint" > "$STATE_FILE"
