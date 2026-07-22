#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/club-pwa-deploy}"
DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
DEPLOYED_COMMIT_FILE="$DEPLOY_STATE_DIR/deployed-commit"
STATUS_FILE="$DEPLOY_STATE_DIR/status.env"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"
LOCK_FILE="/tmp/club-pwa-deploy.lock"
WORKER_FILE="$DEPLOY_DIR/deploy/update-worker.sh"
DEPLOY_WORKER_REEXECUTED="${DEPLOY_WORKER_REEXECUTED:-0}"
DEPLOY_WORKER_LOCK_HELD="${DEPLOY_WORKER_LOCK_HELD:-0}"

current_phase="starting"
current_target=""
current_services="none"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
web_changed=0
api_changed=0
caddy_changed=0
full_reconcile=0
previous_web_image=""
previous_api_image=""

sanitize_status_value() {
  printf '%s' "$1" | tr '\r\n=' '   '
}

write_status() {
  local status="$1"
  local phase="$2"
  local finished_at="${3:-}"
  local temp_file="$STATUS_FILE.tmp.$$"

  mkdir -p "$DEPLOY_STATE_DIR"
  {
    printf 'RUN_ID=%s\n' "$(sanitize_status_value "$DEPLOY_RUN_ID")"
    printf 'STATUS=%s\n' "$(sanitize_status_value "$status")"
    printf 'PHASE=%s\n' "$(sanitize_status_value "$phase")"
    printf 'TARGET_COMMIT=%s\n' "$(sanitize_status_value "$current_target")"
    printf 'SERVICES=%s\n' "$(sanitize_status_value "$current_services")"
    printf 'STARTED_AT=%s\n' "$started_at"
    printf 'FINISHED_AT=%s\n' "$finished_at"
  } > "$temp_file"
  mv "$temp_file" "$STATUS_FILE"
}

fail_status() {
  local exit_code=$?
  trap - EXIT
  if [[ $exit_code -ne 0 ]]; then
    write_status failed "$current_phase" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Deployment failed in phase '$current_phase' with exit code $exit_code" >&2
  fi
  cleanup_previous_images
  exit "$exit_code"
}

trap fail_status EXIT

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

read_env_value() {
  local key="$1"
  [[ -f "$DEPLOY_DIR/.env" ]] || return 0
  local value
  value="$(grep -E "^${key}=" "$DEPLOY_DIR/.env" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

resolve_health_url() {
  if [[ -n "${DEPLOY_HEALTH_URL:-}" ]]; then
    printf '%s' "$DEPLOY_HEALTH_URL"
    return
  fi

  local web_origin public_domain
  web_origin="$(read_env_value WEB_ORIGIN)"
  if [[ -n "$web_origin" ]]; then
    printf '%s/api/health' "${web_origin%/}"
    return
  fi

  public_domain="$(read_env_value PUBLIC_DOMAIN)"
  if [[ -n "$public_domain" ]]; then
    printf 'https://%s/api/health' "$public_domain"
  fi
}

resolve_web_url() {
  if [[ -n "${DEPLOY_WEB_URL:-}" ]]; then
    printf '%s' "$DEPLOY_WEB_URL"
    return
  fi

  local web_origin public_domain
  web_origin="$(read_env_value WEB_ORIGIN)"
  if [[ -n "$web_origin" ]]; then
    printf '%s/' "${web_origin%/}"
    return
  fi

  public_domain="$(read_env_value PUBLIC_DOMAIN)"
  if [[ -n "$public_domain" ]]; then
    printf 'https://%s/' "$public_domain"
  fi
}

resolve_uptime_kuma_url() {
  if [[ -n "${DEPLOY_UPTIME_KUMA_URL:-}" ]]; then
    printf '%s' "$DEPLOY_UPTIME_KUMA_URL"
    return
  fi

  local public_domain
  public_domain="$(read_env_value PUBLIC_DOMAIN)"
  if [[ -n "$public_domain" ]]; then
    printf 'https://%s:8443/' "$public_domain"
  fi
}

wait_for_health() {
  local health_url web_url uptime_kuma_url
  health_url="$(resolve_health_url)"
  web_url="$(resolve_web_url)"
  uptime_kuma_url="$(resolve_uptime_kuma_url)"
  if [[ -z "$health_url" || -z "$web_url" || -z "$uptime_kuma_url" ]]; then
    echo "API health URL, web URL, or Uptime Kuma URL is not configured" >&2
    return 1
  fi

  for _ in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 "$health_url" | grep -q '"ok":true' \
      && curl --fail --silent --show-error --max-time 5 "$web_url" | grep -q '<div id="app"' \
      && curl --fail --silent --show-error --max-time 5 --output /dev/null "$uptime_kuma_url"; then
      echo "Application checks passed: API $health_url; PWA $web_url; Uptime Kuma $uptime_kuma_url"
      return 0
    fi
    sleep 2
  done

  echo "Application checks failed: API $health_url; PWA $web_url; Uptime Kuma $uptime_kuma_url" >&2
  return 1
}

write_deployed_commit() {
  local temp_file="$DEPLOYED_COMMIT_FILE.tmp.$$"
  printf '%s\n' "$current_target" > "$temp_file"
  mv "$temp_file" "$DEPLOYED_COMMIT_FILE"
}

classify_changes() {
  local deployed_commit="$1"
  local path

  if [[ "${DEPLOY_FORCE:-0}" == "1" ]]; then
    web_changed=1
    api_changed=1
    full_reconcile=1
    return
  fi

  if [[ -z "$deployed_commit" ]] \
    || ! git cat-file -e "$deployed_commit^{commit}" 2>/dev/null \
    || ! git merge-base --is-ancestor "$deployed_commit" "$current_target"; then
    web_changed=1
    api_changed=1
    full_reconcile=1
    return
  fi

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    case "$path" in
      apps/web/*test.ts|apps/web/*spec.ts|apps/api/*test.ts|apps/api/*spec.ts)
        ;;
      apps/web/*)
        web_changed=1
        ;;
      apps/api/*)
        api_changed=1
        ;;
      packages/shared/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|tsconfig.base.json)
        web_changed=1
        api_changed=1
        ;;
      docker-compose.prod.yml)
        web_changed=1
        api_changed=1
        caddy_changed=1
        full_reconcile=1
        ;;
      deploy/Caddyfile)
        caddy_changed=1
        ;;
      deploy/*|docs/*|.github/*|README.md)
        ;;
      *)
        web_changed=1
        api_changed=1
        ;;
    esac
  done < <(git diff --name-only "$deployed_commit" "$current_target")
}

set_service_summary() {
  local services=()
  [[ $web_changed -eq 1 ]] && services+=(web)
  [[ $api_changed -eq 1 ]] && services+=(api)
  [[ $caddy_changed -eq 1 ]] && services+=(caddy)
  [[ $full_reconcile -eq 1 ]] && services+=(full)
  if [[ ${#services[@]} -eq 0 ]]; then
    current_services="source-only"
  else
    current_services="$(IFS=,; printf '%s' "${services[*]}")"
  fi
}

build_args=()
if [[ "${DEPLOY_FORCE:-0}" == "1" ]]; then
  build_args+=(--no-cache)
fi

remember_previous_images() {
  if [[ $web_changed -eq 1 ]] && docker image inspect club-pwa-web:latest >/dev/null 2>&1; then
    previous_web_image="club-pwa-web:rollback-$DEPLOY_RUN_ID"
    docker tag club-pwa-web:latest "$previous_web_image"
  fi
  if [[ $api_changed -eq 1 ]] && docker image inspect club-pwa-api:latest >/dev/null 2>&1; then
    previous_api_image="club-pwa-api:rollback-$DEPLOY_RUN_ID"
    docker tag club-pwa-api:latest "$previous_api_image"
  fi
}

cleanup_previous_images() {
  if [[ -n "$previous_web_image" ]]; then
    docker image rm "$previous_web_image" >/dev/null 2>&1 || true
  fi
  if [[ -n "$previous_api_image" ]]; then
    docker image rm "$previous_api_image" >/dev/null 2>&1 || true
  fi
}

deploy_web() {
  current_phase="build-web"
  write_status running "$current_phase"
  compose build "${build_args[@]}" web
  current_phase="restart-web"
  write_status running "$current_phase"
  compose up -d --no-deps web
}

deploy_api() {
  current_phase="build-api"
  write_status running "$current_phase"
  compose build "${build_args[@]}" api
  current_phase="uploads-permissions"
  write_status running "$current_phase"
  compose run --rm uploads-permissions
  current_phase="migrate"
  write_status running "$current_phase"
  compose run --rm migrate
  current_phase="restart-api"
  write_status running "$current_phase"
  compose up -d --no-deps api
}

deploy_full() {
  current_phase="build-all"
  write_status running "$current_phase"
  compose build "${build_args[@]}" api web
  current_phase="uploads-permissions"
  write_status running "$current_phase"
  compose run --rm uploads-permissions
  current_phase="migrate"
  write_status running "$current_phase"
  compose run --rm migrate
  current_phase="reconcile"
  write_status running "$current_phase"
  compose up -d postgres api web uptime-kuma caddy
}

recreate_caddy() {
  current_phase="recreate-caddy"
  write_status running "$current_phase"
  # Caddyfile is mounted as a single file. Git replaces that file by inode
  # during pull, so a reload inside the existing container can keep reading
  # the stale bind mount. Recreating Caddy remounts the current file and also
  # resolves the current Docker IPs for the replaced web/API containers.
  compose up -d --no-deps --force-recreate caddy
}

rollback_services() {
  echo "Health verification failed; attempting container rollback." >&2
  if [[ $api_changed -eq 1 && -n "$previous_api_image" ]]; then
    docker tag "$previous_api_image" club-pwa-api:latest
    compose up -d --no-deps --force-recreate api || true
  fi
  if [[ $web_changed -eq 1 && -n "$previous_web_image" ]]; then
    docker tag "$previous_web_image" club-pwa-web:latest
    compose up -d --no-deps --force-recreate web || true
  fi
  recreate_caddy || true
  wait_for_health || true
  cleanup_previous_images
}

if [[ "$DEPLOY_WORKER_LOCK_HELD" != "1" ]]; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another deployment worker is already running." >&2
    trap - EXIT
    exit 75
  fi
  export DEPLOY_WORKER_LOCK_HELD=1
fi

mkdir -p "$DEPLOY_STATE_DIR"
write_status running starting

cd "$DEPLOY_DIR"

current_phase="resource-check"
write_status running "$current_phase"
"$DEPLOY_DIR/deploy/ensure-swap.sh" || echo "Swap setup warning; continuing deployment." >&2
if ! docker buildx version >/dev/null 2>&1; then
  echo "Docker Buildx is unavailable; Docker Compose will use its fallback builder." >&2
fi

current_phase="pull"
write_status running "$current_phase"
worker_checksum_before="$(sha256sum "$WORKER_FILE" | awk '{print $1}')"
git pull --ff-only
worker_checksum_after="$(sha256sum "$WORKER_FILE" | awk '{print $1}')"
if [[ "$worker_checksum_before" != "$worker_checksum_after" && "$DEPLOY_WORKER_REEXECUTED" != "1" ]]; then
  echo "Deployment worker changed; restarting with the pulled version."
  exec env DEPLOY_WORKER_REEXECUTED=1 DEPLOY_WORKER_LOCK_HELD=1 bash "$WORKER_FILE"
fi
current_target="$(git rev-parse HEAD)"

deployed_commit="$(cat "$DEPLOYED_COMMIT_FILE" 2>/dev/null || true)"
if [[ "$deployed_commit" == "$current_target" && "${DEPLOY_FORCE:-0}" != "1" ]]; then
  current_phase="already-deployed"
  write_status skipped "$current_phase" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Commit $current_target is already deployed and verified."
  exit 0
fi

classify_changes "$deployed_commit"
set_service_summary
write_status running classified
echo "Target: $current_target; services: $current_services"
remember_previous_images

if [[ $full_reconcile -eq 1 ]]; then
  deploy_full
else
  [[ $api_changed -eq 1 ]] && deploy_api
  [[ $web_changed -eq 1 ]] && deploy_web
fi

if [[ $web_changed -eq 1 || $api_changed -eq 1 || $caddy_changed -eq 1 ]]; then
  recreate_caddy
fi

current_phase="health"
write_status running "$current_phase"
if ! wait_for_health; then
  current_phase="rollback"
  write_status running "$current_phase"
  rollback_services
  exit 1
fi

current_phase="cleanup"
write_status running "$current_phase"
cleanup_previous_images
docker image prune -f --filter "until=72h" >/dev/null || true
if docker buildx version >/dev/null 2>&1; then
  docker buildx prune -f --filter "until=168h" >/dev/null || true
fi

current_phase="record-success"
write_deployed_commit
write_status success complete "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trap - EXIT
echo "Deployment completed and verified: $current_target"
