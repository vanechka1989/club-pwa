#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
cd "$DEPLOY_DIR"

docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}" \
  api bun apps/api/src/db/runAutomaticBackup.ts
