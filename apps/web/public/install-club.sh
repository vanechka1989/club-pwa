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

generate_vapid_keys() {
  docker run --rm -i node:22-alpine node <<'NODE'
const { generateKeyPairSync } = require("node:crypto");

function fromBase64Url(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(`${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = publicKey.export({ format: "jwk" });
const publicBytes = Buffer.concat([Buffer.from([4]), fromBase64Url(publicJwk.x), fromBase64Url(publicJwk.y)]);

console.log(toBase64Url(publicBytes));
console.log(privateJwk.d);
NODE
}

ensure_vapid_keys() {
  if [[ -n "$WEB_PUSH_PUBLIC_KEY" && -n "$WEB_PUSH_PRIVATE_KEY" ]]; then
    return
  fi

  echo "Генерируем Web Push VAPID ключи..."
  local generated_keys
  generated_keys="$(generate_vapid_keys)"
  WEB_PUSH_PUBLIC_KEY="$(printf '%s\n' "$generated_keys" | sed -n '1p')"
  WEB_PUSH_PRIVATE_KEY="$(printf '%s\n' "$generated_keys" | sed -n '2p')"

  if [[ -z "$WEB_PUSH_PUBLIC_KEY" || -z "$WEB_PUSH_PRIVATE_KEY" ]]; then
    echo "Не удалось сгенерировать Web Push VAPID ключи." >&2
    exit 1
  fi
}

wait_for_api_container() {
  echo "Ждём готовность API перед следующими шагами..."

  for _ in {1..60}; do
    if docker compose exec -T api bun -e 'try { const response = await fetch("http://127.0.0.1:3000/health"); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }' >/dev/null 2>&1; then
      echo "API готов."
      return 0
    fi

    sleep 2
  done

  echo "API не успел запуститься. Последние логи:" >&2
  docker compose logs --tail=120 api >&2 || true
  return 1
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
   - ghcr.io/vanechka1989/club-pwa-api
   - ghcr.io/vanechka1989/club-pwa-web

Если образы ещё закрыты, один раз откройте их в GitHub:
Repository -> Packages -> package -> Package settings -> Change visibility -> Public.
MESSAGE
  return 1
}

echo
echo "Установка PWA-клуба без токена GitHub"
echo "Если значение в квадратных скобках подходит, просто нажмите Enter."
echo
echo "Перед началом подготовьте:"
echo "- домен для PWA с A-записью на IP сервера, например club2.myn8nservertest.ru"
echo "- email владельца клуба, например owner@example.com"
echo "- SMTP-ящик для кодов входа, например club@myn8nservertest.ru"
echo "- SMTP пример Timeweb: host smtp.timeweb.ru, port 465, user полный ящик, password пароль от ящика"
echo "- PWA push-ключи создаются автоматически, вручную их готовить не нужно"
echo

DEPLOY_DIR="${DEPLOY_DIR:-$(prompt "Папка установки" "/opt/club-pwa")}"

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
echo "Email-доступ."
OWNER_EMAIL="${OWNER_EMAIL:-$(prompt "Email владельца клуба")}"
ADMIN_EMAILS="${ADMIN_EMAILS:-$(prompt "Дополнительные email админов через запятую" "")}"

echo
echo "SMTP для кодов входа."
echo "В production нужен SMTP, иначе email-коды не будут отправляться."
echo "SMTP пример Timeweb: host smtp.timeweb.ru, port 465, user club@myn8nservertest.ru"
SMTP_HOST="${SMTP_HOST:-$(prompt "SMTP host (Timeweb: smtp.timeweb.ru)" "smtp.timeweb.ru")}"
SMTP_PORT="${SMTP_PORT:-$(prompt "SMTP port (Timeweb SSL: 465)" "465")}"
SMTP_USER="${SMTP_USER:-$(prompt "SMTP user (полный ящик, например club@myn8nservertest.ru)" "")}"
SMTP_PASSWORD="${SMTP_PASSWORD:-$(prompt_secret "SMTP password (пароль от этого ящика; ввод скрыт)")}"
SMTP_FROM_DEFAULT="$OWNER_EMAIL"
if [[ -n "$SMTP_USER" ]]; then
  SMTP_FROM_DEFAULT="$SMTP_USER"
fi
SMTP_FROM="${SMTP_FROM:-$(prompt "SMTP from (пример: Club <club@myn8nservertest.ru>)" "Club <$SMTP_FROM_DEFAULT>")}"

echo
echo "DKIM для писем."
echo "Если у почтового сервиса нет готовой DKIM-записи, можно настроить app-managed DKIM позже."
DKIM_DOMAIN="${DKIM_DOMAIN:-$(prompt "DKIM domain (пусто = пропустить)" "")}"
DKIM_SELECTOR="${DKIM_SELECTOR:-$(prompt "DKIM selector (например club; пусто = пропустить)" "")}"
DKIM_PRIVATE_KEY="${DKIM_PRIVATE_KEY:-$(prompt_secret "DKIM private key PEM одной строкой с \\n (пусто = пропустить)")}"

echo
echo "Web Push VAPID ключи."
echo "PWA push-ключи создаются автоматически, вручную их готовить не нужно."
echo "Контакт обычно выглядит так: mailto:club@myn8nservertest.ru"
EXISTING_WEB_PUSH_PUBLIC_KEY="$(existing_env_value "$DEPLOY_DIR/.env" WEB_PUSH_PUBLIC_KEY || true)"
EXISTING_WEB_PUSH_PRIVATE_KEY="$(existing_env_value "$DEPLOY_DIR/.env" WEB_PUSH_PRIVATE_KEY || true)"
WEB_PUSH_PUBLIC_KEY="${WEB_PUSH_PUBLIC_KEY:-$EXISTING_WEB_PUSH_PUBLIC_KEY}"
WEB_PUSH_PRIVATE_KEY="${WEB_PUSH_PRIVATE_KEY:-$EXISTING_WEB_PUSH_PRIVATE_KEY}"
WEB_PUSH_SUBJECT="${WEB_PUSH_SUBJECT:-$(prompt "Web Push contact" "mailto:$OWNER_EMAIL")}"

echo
RUN_SEED="${RUN_SEED:-$(prompt "Добавить базовый демо-контент? y/n" "y")}"

IMAGE_TAG="${IMAGE_TAG:-latest}"
CLUB_API_IMAGE="${CLUB_API_IMAGE:-ghcr.io/vanechka1989/club-pwa-api:$IMAGE_TAG}"
CLUB_WEB_IMAGE="${CLUB_WEB_IMAGE:-ghcr.io/vanechka1989/club-pwa-web:$IMAGE_TAG}"

EXISTING_POSTGRES_PASSWORD="$(existing_env_value "$DEPLOY_DIR/.env" POSTGRES_PASSWORD || true)"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${EXISTING_POSTGRES_PASSWORD:-$(random_secret)}}"
EXISTING_MAILING_UNSUBSCRIBE_SECRET="$(existing_env_value "$DEPLOY_DIR/.env" MAILING_UNSUBSCRIBE_SECRET || true)"
MAILING_UNSUBSCRIBE_SECRET="${MAILING_UNSUBSCRIBE_SECRET:-${EXISTING_MAILING_UNSUBSCRIBE_SECRET:-$(random_secret)}}"

echo
echo "Устанавливаем Docker и системные зависимости..."
install_packages
ensure_vapid_keys

mkdir -p "$DEPLOY_DIR/deploy"

cat >"$DEPLOY_DIR/.env" <<ENV
POSTGRES_USER=club
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=club
PUBLIC_DOMAIN=$PUBLIC_DOMAIN
WEB_ORIGIN=$PUBLIC_WEB_URL
PUBLIC_API_URL=$PUBLIC_API_URL
OWNER_EMAIL=$OWNER_EMAIL
ADMIN_EMAILS=$ADMIN_EMAILS
AUTH_LOGIN_CODE_TTL_MINUTES=10
AUTH_SESSION_TTL_DAYS=30
AUTH_DEV_CODE_ENABLED=false
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASSWORD=$SMTP_PASSWORD
SMTP_FROM=$SMTP_FROM
DKIM_DOMAIN=$DKIM_DOMAIN
DKIM_SELECTOR=$DKIM_SELECTOR
DKIM_PRIVATE_KEY=$DKIM_PRIVATE_KEY
MAILING_UNSUBSCRIBE_SECRET=$MAILING_UNSUBSCRIBE_SECRET
WEB_PUSH_PUBLIC_KEY=$WEB_PUSH_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY=$WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT=$WEB_PUSH_SUBJECT
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
    Content-Security-Policy "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()"
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
      OWNER_EMAIL: ${OWNER_EMAIL}
      ADMIN_EMAILS: ${ADMIN_EMAILS:-}
      AUTH_LOGIN_CODE_TTL_MINUTES: ${AUTH_LOGIN_CODE_TTL_MINUTES:-10}
      AUTH_SESSION_TTL_DAYS: ${AUTH_SESSION_TTL_DAYS:-30}
      AUTH_DEV_CODE_ENABLED: ${AUTH_DEV_CODE_ENABLED:-false}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      SMTP_FROM: ${SMTP_FROM:-}
      DKIM_DOMAIN: ${DKIM_DOMAIN:-}
      DKIM_SELECTOR: ${DKIM_SELECTOR:-}
      DKIM_PRIVATE_KEY: ${DKIM_PRIVATE_KEY:-}
      MAILING_UNSUBSCRIBE_SECRET: ${MAILING_UNSUBSCRIBE_SECRET:-}
      WEB_PUSH_PUBLIC_KEY: ${WEB_PUSH_PUBLIC_KEY:-}
      WEB_PUSH_PRIVATE_KEY: ${WEB_PUSH_PRIVATE_KEY:-}
      WEB_PUSH_SUBJECT: ${WEB_PUSH_SUBJECT:-}
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
    volumes:
      - api-uploads:/app/uploads
    expose:
      - "3000"

  migrate:
    image: ${CLUB_API_IMAGE}
    restart: "no"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER:-club}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-club}
      WEB_ORIGIN: ${WEB_ORIGIN}
      OWNER_EMAIL: ${OWNER_EMAIL}
      ADMIN_EMAILS: ${ADMIN_EMAILS:-}
      AUTH_LOGIN_CODE_TTL_MINUTES: ${AUTH_LOGIN_CODE_TTL_MINUTES:-10}
      AUTH_SESSION_TTL_DAYS: ${AUTH_SESSION_TTL_DAYS:-30}
      AUTH_DEV_CODE_ENABLED: ${AUTH_DEV_CODE_ENABLED:-false}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      SMTP_FROM: ${SMTP_FROM:-}
      DKIM_DOMAIN: ${DKIM_DOMAIN:-}
      DKIM_SELECTOR: ${DKIM_SELECTOR:-}
      DKIM_PRIVATE_KEY: ${DKIM_PRIVATE_KEY:-}
      MAILING_UNSUBSCRIBE_SECRET: ${MAILING_UNSUBSCRIBE_SECRET:-}
      WEB_PUSH_PUBLIC_KEY: ${WEB_PUSH_PUBLIC_KEY:-}
      WEB_PUSH_PRIVATE_KEY: ${WEB_PUSH_PRIVATE_KEY:-}
      WEB_PUSH_SUBJECT: ${WEB_PUSH_SUBJECT:-}
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
  api-uploads:
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
wait_for_api_container

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
