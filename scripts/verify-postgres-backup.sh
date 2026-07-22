#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/club-pwa-backup}"
STATUS_FILE="$STATE_DIR/restore.env"
temp_dir="$(mktemp -d /tmp/club-pwa-backup-verify.XXXXXX)"
container_name="club-pwa-backup-verify-$$"

write_status() {
  local status="$1"
  local detail="$2"
  local status_temp="$STATUS_FILE.tmp.$$"
  mkdir -p "$STATE_DIR"
  detail="$(printf '%s' "$detail" | tr '\r\n=' '   ' | cut -c1-500)"
  {
    printf 'STATUS=%s\n' "$status"
    printf 'FINISHED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'DETAIL=%s\n' "$detail"
  } > "$status_temp"
  chmod 600 "$status_temp"
  mv "$status_temp" "$STATUS_FILE"
}

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if [[ "$temp_dir" == /tmp/club-pwa-backup-verify.* ]]; then
    rm -rf -- "$temp_dir"
  else
    echo "Refusing to remove unexpected temporary path: $temp_dir" >&2
  fi
}
trap cleanup EXIT

on_error() {
  local exit_code=$?
  trap - ERR
  write_status failed "restore verification exited with code $exit_code"
  exit "$exit_code"
}
trap on_error ERR

chmod 0777 "$temp_dir"
cd "$DEPLOY_DIR"
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$temp_dir:/backup-export" \
  api bun apps/api/src/db/exportLatestAutomaticBackup.ts /backup-export/latest.dump >/dev/null

docker run --detach --network none --name "$container_name" \
  --env POSTGRES_USER=verify --env POSTGRES_PASSWORD=verify-only --env POSTGRES_DB=verify \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=512m \
  --volume "$temp_dir:/backup:ro" \
  postgres:16-alpine >/dev/null

ready=0
for _ in {1..30}; do
  if docker exec "$container_name" pg_isready --username verify --dbname verify >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ $ready -eq 1 ]] || { echo "temporary PostgreSQL did not become ready" >&2; exit 1; }

docker exec "$container_name" pg_restore --exit-on-error --no-owner --no-privileges \
  --username verify --dbname verify /backup/latest.dump >/dev/null
table_exists="$(docker exec "$container_name" psql --username verify --dbname verify --tuples-only --no-align \
  --command "select to_regclass('public.users') is not null")"
[[ "$table_exists" == "t" ]] || { echo "restored database is missing public.users" >&2; exit 1; }

write_status success "latest database backup restored and public.users is readable"
