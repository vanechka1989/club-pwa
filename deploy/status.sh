#!/usr/bin/env bash
set -euo pipefail

DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/club-pwa-deploy}"
STATUS_FILE="$DEPLOY_STATE_DIR/status.env"
DEPLOY_SYSTEMD_UNIT="club-pwa-deploy.service"

if [[ -f "$STATUS_FILE" ]]; then
  cat "$STATUS_FILE"
else
  echo "STATUS=never-run"
fi

if [[ "${1:-}" == "--summary" ]]; then
  exit 0
fi

echo
echo "SYSTEMD_ACTIVE=$(systemctl is-active "$DEPLOY_SYSTEMD_UNIT" 2>/dev/null || true)"
echo "SYSTEMD_RESULT=$(systemctl show "$DEPLOY_SYSTEMD_UNIT" --property=Result --value 2>/dev/null || true)"
echo
echo "RECENT_LOGS"
journalctl -u "$DEPLOY_SYSTEMD_UNIT" --no-pager -n 80 2>/dev/null || true
