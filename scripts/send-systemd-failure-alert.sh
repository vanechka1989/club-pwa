#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
unit="${1:-unknown-unit}"
unit="$(printf '%s' "$unit" | tr -cd '[:alnum:]_.@:-' | cut -c1-160)"

cd "$DEPLOY_DIR"
detail="Systemd unit ${unit:-unknown-unit} failed on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose -f docker-compose.prod.yml run --rm --no-deps api \
  bun apps/api/src/operations/sendOperationalAlert.ts critical "$detail"
