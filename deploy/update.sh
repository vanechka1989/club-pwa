#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"

cd "$DEPLOY_DIR"

exec 9>"/tmp/club-pwa-deploy.lock"
flock 9

read_env_value() {
  local key="$1"

  if [[ ! -f .env ]]; then
    return 0
  fi

  local value
  value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

resolve_health_url() {
  if [[ -n "${DEPLOY_HEALTH_URL:-}" ]]; then
    printf '%s' "$DEPLOY_HEALTH_URL"
    return
  fi

  local web_origin
  web_origin="$(read_env_value WEB_ORIGIN)"
  if [[ -n "$web_origin" ]]; then
    printf '%s/api/health' "${web_origin%/}"
    return
  fi

  local public_domain
  public_domain="$(read_env_value PUBLIC_DOMAIN)"
  if [[ -n "$public_domain" ]]; then
    printf 'https://%s/api/health' "$public_domain"
  fi
}

wait_for_health() {
  local health_url
  health_url="$(resolve_health_url)"

  if [[ -z "$health_url" ]]; then
    echo "Health URL is not configured" >&2
    return 1
  fi

  for _ in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 "$health_url" | grep -q '"ok":true'; then
      echo "Health check passed: $health_url"
      return 0
    fi

    sleep 2
  done

  echo "Health check failed: $health_url" >&2
  return 1
}

previous_commit="$(git rev-parse HEAD)"
git pull --ff-only
current_commit="$(git rev-parse HEAD)"

if [[ "$previous_commit" == "$current_commit" && "${DEPLOY_FORCE:-}" != "1" ]]; then
  echo "Already up to date; deployment skipped."
  exit 0
fi

build_args=()
if [[ "${DEPLOY_FORCE:-}" == "1" ]]; then
  build_args+=(--no-cache)
fi

docker compose -f docker-compose.prod.yml build "${build_args[@]}"
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
wait_for_health
