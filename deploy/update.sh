#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/club-pwa-deploy}"
DEPLOY_ASYNC="${DEPLOY_ASYNC:-0}"
DEPLOY_SYSTEMD_UNIT="club-pwa-deploy.service"
WORKER="$DEPLOY_DIR/deploy/update-worker.sh"
STATUS_FILE="$DEPLOY_STATE_DIR/status.env"

read_status_value() {
  local key="$1"
  [[ -f "$STATUS_FILE" ]] || return 0
  awk -F= -v key="$key" '$1 == key { value = substr($0, index($0, "=") + 1) } END { print value }' "$STATUS_FILE"
}

print_status() {
  "$DEPLOY_DIR/deploy/status.sh" --summary || true
}

write_pending_status() {
  local run_id="$1"
  local temp_file="$STATUS_FILE.tmp.$$"
  {
    printf 'RUN_ID=%s\n' "$run_id"
    printf 'STATUS=queued\n'
    printf 'PHASE=launcher\n'
    printf 'TARGET_COMMIT=\n'
    printf 'SERVICES=unknown\n'
    printf 'STARTED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'FINISHED_AT=\n'
  } > "$temp_file"
  mv "$temp_file" "$STATUS_FILE"
}

wait_for_run() {
  local run_id="$1"
  local observed_run status

  for _ in {1..1800}; do
    observed_run="$(read_status_value RUN_ID)"
    status="$(read_status_value STATUS)"

    if [[ "$observed_run" == "$run_id" ]]; then
      case "$status" in
        success|skipped)
          print_status
          return 0
          ;;
        failed)
          print_status
          journalctl -u "$DEPLOY_SYSTEMD_UNIT" --no-pager -n 120 || true
          return 1
          ;;
      esac
    fi

    sleep 2
  done

  echo "Timed out waiting for deployment run $run_id" >&2
  print_status
  return 1
}

run_inline() {
  echo "systemd-run is unavailable; running deployment in the current session." >&2
  DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}" \
    DEPLOY_DIR="$DEPLOY_DIR" \
    DEPLOY_STATE_DIR="$DEPLOY_STATE_DIR" \
    DEPLOY_FORCE="${DEPLOY_FORCE:-0}" \
    DEPLOY_EXPECTED_COMMIT="${DEPLOY_EXPECTED_COMMIT:-}" \
    DEPLOY_SWAP_SIZE_GB="${DEPLOY_SWAP_SIZE_GB:-2}" \
    bash "$WORKER"
}

mkdir -p "$DEPLOY_STATE_DIR"

if [[ ! -x "$WORKER" ]]; then
  echo "Deployment worker is missing or is not executable: $WORKER" >&2
  exit 1
fi

if ! command -v systemd-run >/dev/null 2>&1 \
  || ! command -v systemctl >/dev/null 2>&1 \
  || [[ ! -d /run/systemd/system ]]; then
  run_inline
  exit $?
fi

if systemctl is-active --quiet "$DEPLOY_SYSTEMD_UNIT"; then
  active_run_id="$(read_status_value RUN_ID)"
  echo "Deployment is already running: ${active_run_id:-unknown}"
  if [[ "$DEPLOY_ASYNC" == "1" ]]; then
    print_status
    exit 0
  fi
  wait_for_run "$active_run_id"
  exit $?
fi

run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
write_pending_status "$run_id"
systemd_args=(
  --quiet
  --collect
  --unit="$DEPLOY_SYSTEMD_UNIT"
  --property=Type=oneshot
  --property="WorkingDirectory=$DEPLOY_DIR"
  --setenv="DEPLOY_DIR=$DEPLOY_DIR"
  --setenv="DEPLOY_STATE_DIR=$DEPLOY_STATE_DIR"
  --setenv="DEPLOY_RUN_ID=$run_id"
  --setenv="DEPLOY_FORCE=${DEPLOY_FORCE:-0}"
  --setenv="DEPLOY_EXPECTED_COMMIT=${DEPLOY_EXPECTED_COMMIT:-}"
  --setenv="DEPLOY_SWAP_SIZE_GB=${DEPLOY_SWAP_SIZE_GB:-2}"
)

if [[ -n "${DEPLOY_HEALTH_URL:-}" ]]; then
  systemd_args+=(--setenv="DEPLOY_HEALTH_URL=$DEPLOY_HEALTH_URL")
fi

systemctl reset-failed "$DEPLOY_SYSTEMD_UNIT" >/dev/null 2>&1 || true
for _ in {1..20}; do
  if ! systemctl show "$DEPLOY_SYSTEMD_UNIT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
systemd-run "${systemd_args[@]}" /usr/bin/env bash "$WORKER"

echo "Deployment started: $run_id"
echo "Status: DEPLOY_DIR=$DEPLOY_DIR bash $DEPLOY_DIR/deploy/status.sh"

if [[ "$DEPLOY_ASYNC" == "1" ]]; then
  exit 0
fi

wait_for_run "$run_id"
