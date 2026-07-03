#!/usr/bin/env bash
set -euo pipefail

prompt() {
  local label="$1"
  local default_value="${2:-}"
  local value

  if [[ -n "$default_value" ]]; then
    read -r -p "$label [$default_value]: " value
    printf '%s' "${value:-$default_value}"
  else
    read -r -p "$label: " value
    printf '%s' "$value"
  fi
}

prompt_secret() {
  local label="$1"
  local value
  read -r -s -p "$label: " value
  printf '\n' >&2
  printf '%s' "$value"
}

random_secret() {
  openssl rand -hex 32 | tr -d '\n'
}

existing_env_value() {
  local env_file="$1"
  local key="$2"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  grep -E "^${key}=" "$env_file" | tail -n 1 | cut -d= -f2-
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl openssl

    if ! command -v docker >/dev/null 2>&1; then
      apt-get install -y docker.io
    fi

    if ! docker compose version >/dev/null 2>&1; then
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    fi

    systemctl enable --now docker
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl openssl
    if ! command -v docker >/dev/null 2>&1; then
      dnf install -y docker
    fi
    if ! docker compose version >/dev/null 2>&1; then
      dnf install -y docker-compose-plugin
    fi
    systemctl enable --now docker
    return
  fi

  echo "ОС сервера не поддержана автоматически. Установите Docker и Docker Compose вручную." >&2
  exit 1
}

wait_for_health() {
  local health_url="$1"

  for _ in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 "$health_url" | grep -q '"ok":true'; then
      echo "Проверка сервера прошла: $health_url"
      return 0
    fi

    sleep 2
  done

  echo "Сервер запустился некорректно или не ответил вовремя: $health_url" >&2
  return 1
}

pull_images() {
  if docker compose pull; then
    return 0
  fi

  cat >&2 <<'MESSAGE'

Не удалось скачать готовые образы клуба.

Что проверить:
1. На сервере есть интернет.
2. Docker работает: docker ps
3. Образы в реестре контейнеров GitHub открыты публично:
   - ghcr.io/vanechka1989/club-crm-api
   - ghcr.io/vanechka1989/club-crm-web

Если образы ещё закрыты, один раз откройте их в GitHub:
Repository -> Packages -> package -> Package settings -> Change visibility -> Public.
MESSAGE
  return 1
}

echo
echo "Установка шаблонного Telegram-клуба без токена GitHub"
echo "Если значение в квадратных скобках подходит, просто нажмите Enter."
echo

DEPLOY_DIR="${DEPLOY_DIR:-$(prompt "Папка установки" "/opt/club-crm")}"

DEFAULT_SERVER_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
SERVER_HOST="${SERVER_HOST:-$(prompt "IP сервера или домен" "$DEFAULT_SERVER_HOST")}"

DEFAULT_PUBLIC_DOMAIN="$SERVER_HOST"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN#http://}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN#https://}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN%%/*}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN%.}"

PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-$(prompt "Домен для HTTPS без http/https" "$DEFAULT_PUBLIC_DOMAIN")}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN%.}"
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-$(prompt "Адрес клуба" "https://$PUBLIC_DOMAIN")}"
PUBLIC_API_URL="${PUBLIC_API_URL:-$(prompt "Адрес API" "${PUBLIC_WEB_URL%/}/api")}"

echo
echo "Токен Telegram-бота из BotFather."
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(prompt_secret "Токен Telegram-бота")}"

echo
echo "Telegram ID владельца клуба. Его можно узнать через @userinfobot."
OWNER_TELEGRAM_ID="${OWNER_TELEGRAM_ID:-$(prompt "Telegram ID владельца")}"
ADMIN_TELEGRAM_IDS="${ADMIN_TELEGRAM_IDS:-$(prompt "Дополнительные Telegram ID админов через запятую" "")}"

echo
RUN_SEED="${RUN_SEED:-$(prompt "Добавить базовый демо-контент? y/n" "y")}"

IMAGE_TAG="${IMAGE_TAG:-latest}"
CLUB_API_IMAGE="${CLUB_API_IMAGE:-ghcr.io/vanechka1989/club-crm-api:$IMAGE_TAG}"
CLUB_WEB_IMAGE="${CLUB_WEB_IMAGE:-ghcr.io/vanechka1989/club-crm-web:$IMAGE_TAG}"

EXISTING_POSTGRES_PASSWORD="$(existing_env_value "$DEPLOY_DIR/.env" POSTGRES_PASSWORD || true)"
EXISTING_TELEGRAM_WEBHOOK_SECRET="$(existing_env_value "$DEPLOY_DIR/.env" TELEGRAM_WEBHOOK_SECRET || true)"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${EXISTING_POSTGRES_PASSWORD:-$(random_secret)}}"
TELEGRAM_WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-${EXISTING_TELEGRAM_WEBHOOK_SECRET:-$(random_secret)}}"

echo
echo "Устанавливаем Docker и системные зависимости..."
install_packages

mkdir -p "$DEPLOY_DIR/deploy"

cat >"$DEPLOY_DIR/.env" <<ENV
POSTGRES_USER=club
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=club
PUBLIC_DOMAIN=$PUBLIC_DOMAIN
WEB_ORIGIN=$PUBLIC_WEB_URL
PUBLIC_API_URL=$PUBLIC_API_URL
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET
OWNER_TELEGRAM_ID=$OWNER_TELEGRAM_ID
ADMIN_TELEGRAM_IDS=$ADMIN_TELEGRAM_IDS
CLUB_API_IMAGE=$CLUB_API_IMAGE
CLUB_WEB_IMAGE=$CLUB_WEB_IMAGE
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
S3_SIGNED_URL_TTL_SECONDS=3600
ENV
chmod 600 "$DEPLOY_DIR/.env"

cat >"$DEPLOY_DIR/deploy/Caddyfile" <<'CADDY'
{$PUBLIC_DOMAIN} {
  encode gzip
  header {
    Content-Security-Policy "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://t.me https://telegram.org; object-src 'none'; base-uri 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
  }

  handle_path /api/* {
    reverse_proxy api:3000
  }

  handle {
    reverse_proxy web:80
  }
}
CADDY

cat >"$DEPLOY_DIR/docker-compose.yml" <<'COMPOSE'
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-club}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-club}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-club} -d ${POSTGRES_DB:-club}"]
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    image: ${CLUB_API_IMAGE}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER:-club}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-club}
      WEB_ORIGIN: ${WEB_ORIGIN}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET:-}
      OWNER_TELEGRAM_ID: ${OWNER_TELEGRAM_ID}
      ADMIN_TELEGRAM_IDS: ${ADMIN_TELEGRAM_IDS:-}
      S3_ENDPOINT: ${S3_ENDPOINT:-}
      S3_REGION: ${S3_REGION:-us-east-1}
      S3_BUCKET: ${S3_BUCKET:-}
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID:-}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:-}
      S3_PUBLIC_BASE_URL: ${S3_PUBLIC_BASE_URL:-}
      S3_SIGNED_URL_TTL_SECONDS: ${S3_SIGNED_URL_TTL_SECONDS:-3600}
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "3000"

  migrate:
    image: ${CLUB_API_IMAGE}
    restart: "no"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER:-club}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-club}
      WEB_ORIGIN: ${WEB_ORIGIN}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET:-}
      OWNER_TELEGRAM_ID: ${OWNER_TELEGRAM_ID}
      ADMIN_TELEGRAM_IDS: ${ADMIN_TELEGRAM_IDS:-}
      S3_ENDPOINT: ${S3_ENDPOINT:-}
      S3_REGION: ${S3_REGION:-us-east-1}
      S3_BUCKET: ${S3_BUCKET:-}
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID:-}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:-}
      S3_PUBLIC_BASE_URL: ${S3_PUBLIC_BASE_URL:-}
      S3_SIGNED_URL_TTL_SECONDS: ${S3_SIGNED_URL_TTL_SECONDS:-3600}
    depends_on:
      postgres:
        condition: service_healthy
    command: ["pnpm", "--filter", "@club/api", "db:migrate"]

  web:
    image: ${CLUB_WEB_IMAGE}
    restart: unless-stopped
    depends_on:
      - api
    expose:
      - "80"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      PUBLIC_DOMAIN: ${PUBLIC_DOMAIN}
    depends_on:
      - web
      - api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  postgres-data:
  caddy-data:
  caddy-config:
COMPOSE

cat >"$DEPLOY_DIR/update.sh" <<'UPDATE'
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! docker compose pull; then
  cat >&2 <<'MESSAGE'
Не удалось скачать обновление клуба.
Проверьте интернет на сервере и публичность образов в реестре контейнеров GitHub.
MESSAGE
  exit 1
fi

echo "Применяем миграции базы..."
docker compose run --rm migrate
echo "Перезапускаем клуб..."
docker compose up -d
docker compose ps

HEALTH_URL="$(grep -E '^PUBLIC_API_URL=' .env | tail -n 1 | cut -d= -f2-)/health"
for _ in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" | grep -q '"ok":true'; then
    echo "Проверка сервера прошла: $HEALTH_URL"
    exit 0
  fi
  sleep 2
done

echo "Сервер запустился некорректно или не ответил вовремя: $HEALTH_URL" >&2
exit 1
UPDATE
chmod +x "$DEPLOY_DIR/update.sh"

cd "$DEPLOY_DIR"

echo
echo "Скачиваем готовые образы клуба..."
pull_images

echo
echo "Применяем миграции базы..."
docker compose run --rm migrate

echo
echo "Запускаем клуб..."
docker compose up -d

if [[ "$RUN_SEED" == "y" || "$RUN_SEED" == "yes" ]]; then
  echo
  echo "Добавляем базовый демо-контент..."
  docker compose exec -T api pnpm --filter @club/api db:seed
fi

docker compose ps
wait_for_health "$PUBLIC_API_URL/health"

echo
echo "Установка завершена."
echo "Адрес клуба: $PUBLIC_WEB_URL"
echo "Проверка API: $PUBLIC_API_URL/health"
echo "Обновление позже: bash $DEPLOY_DIR/update.sh"
