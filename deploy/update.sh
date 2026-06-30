#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-crm}"

cd "$DEPLOY_DIR"

exec 9>"/tmp/club-crm-deploy.lock"
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

notify_deploy_message() {
  local message="$1"
  local token
  token="${TELEGRAM_BOT_TOKEN:-$(read_env_value TELEGRAM_BOT_TOKEN)}"

  local chat_ids
  chat_ids="${DEPLOY_NOTIFY_TELEGRAM_IDS:-$(read_env_value DEPLOY_NOTIFY_TELEGRAM_IDS)}"
  if [[ -z "$chat_ids" ]]; then
    chat_ids="$(read_env_value OWNER_TELEGRAM_ID)"
  fi

  if [[ -z "$token" || -z "$chat_ids" ]]; then
    echo "Telegram deploy notification skipped: token or recipient is not configured"
    return 0
  fi

  local normalized_ids chat_id
  normalized_ids="${chat_ids//,/ }"
  for chat_id in $normalized_ids; do
    if [[ -z "$chat_id" ]]; then
      continue
    fi

    if ! curl --fail --silent --show-error --max-time 10 \
      --request POST "https://api.telegram.org/bot${token}/sendMessage" \
      --data-urlencode "chat_id=${chat_id}" \
      --data-urlencode "text=${message}" \
      >/dev/null; then
      echo "Telegram deploy notification failed for chat ${chat_id}" >&2
    fi
  done
}

notify_deploy_start() {
  local commit app_url message
  commit="$(git rev-parse --short HEAD)"
  app_url="$(read_env_value WEB_ORIGIN)"

  message="$(printf 'Обновление клуба началось.\nCommit: %s\nСервер: обновляется' "$commit")"
  if [[ -n "$app_url" ]]; then
    message="$(printf '%s\n%s' "$message" "$app_url")"
  fi

  notify_deploy_message "$message"
}

notify_deploy_success() {
  local version updated_at commit app_url
  version="$(sed -n 's/export const appVersion = "\(.*\)";/\1/p' apps/web/src/features/app/version.ts | head -n 1)"
  updated_at="$(sed -n 's/export const appVersionUpdatedAt = "\(.*\)";/\1/p' apps/web/src/features/app/version.ts | head -n 1)"
  commit="$(git rev-parse --short HEAD)"
  app_url="$(read_env_value WEB_ORIGIN)"

  local message
  message="$(printf 'Обновление клуба загружено.\nВерсия: %s\nДата: %s\nCommit: %s\nСервер: работает' "$version" "$updated_at" "$commit")"
  if [[ -n "$app_url" ]]; then
    message="$(printf '%s\n%s' "$message" "$app_url")"
  fi

  notify_deploy_message "$message"
}

previous_commit="$(git rev-parse HEAD)"
git pull --ff-only
current_commit="$(git rev-parse HEAD)"

if [[ "$previous_commit" == "$current_commit" && "${DEPLOY_FORCE:-}" != "1" ]]; then
  echo "Already up to date; deployment skipped."
  exit 0
fi

if [[ "${DEPLOY_NOTIFY_START_SENT:-}" != "1" ]]; then
  notify_deploy_start
fi

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
wait_for_health
notify_deploy_success
