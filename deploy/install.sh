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

random_password() {
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

generate_remote_vapid_keys() {
  ssh "$SSH_TARGET" "docker run --rm -i node:22-alpine node" <<'NODE'
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

echo
echo "Установка PWA-клуба на удалённый сервер по SSH"
echo "Если значение в квадратных скобках подходит, просто нажмите Enter."
echo
echo "Перед началом подготовьте:"
echo "- домен для PWA с A-записью на IP сервера, например club2.myn8nservertest.ru"
echo "- email владельца клуба, например owner@example.com"
echo "- SMTP-ящик для кодов входа, например club@myn8nservertest.ru"
echo "- SMTP пример Timeweb: host smtp.timeweb.ru, port 465, user полный ящик, password пароль от ящика"
echo "- PWA push-ключи создаются автоматически, вручную их готовить не нужно"
echo

REPO_URL="${REPO_URL:-$(prompt "GitHub repo URL репозитория" "https://github.com/vanechka1989/club-pwa.git")}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

echo "1. Сервер для установки."
SERVER_HOST="${SERVER_HOST:-$(prompt "IP сервера или домен SSH")}"
SERVER_USER="${SERVER_USER:-$(prompt "SSH пользователь" "root")}"
DEPLOY_DIR="${DEPLOY_DIR:-$(prompt "Папка установки на сервере" "/opt/club-pwa")}"
SSH_TARGET="$SERVER_USER@$SERVER_HOST"
echo

echo "2. Публичные адреса."
echo "Для PWA нужен HTTPS-домен. API работает на том же домене по пути /api."
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-$(prompt "Web URL" "https://$SERVER_HOST")}"
PUBLIC_API_URL="${PUBLIC_API_URL:-$(prompt "API URL" "https://$SERVER_HOST/api")}"
DEFAULT_PUBLIC_DOMAIN="$PUBLIC_WEB_URL"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN#http://}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN#https://}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN%%/*}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN%.}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-$(prompt "Домен для HTTPS без http/https" "$DEFAULT_PUBLIC_DOMAIN")}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN%.}"
echo

echo "3. Email-доступ."
OWNER_EMAIL="${OWNER_EMAIL:-$(prompt "Email владельца клуба")}"
ADMIN_EMAILS="${ADMIN_EMAILS:-$(prompt "Дополнительные email админов через запятую" "")}"
echo

echo "4. SMTP для кодов входа."
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

echo "4.1. Web Push VAPID ключи."
echo "PWA push-ключи создаются автоматически на сервере, вручную их готовить не нужно."
echo "Контакт обычно выглядит так: mailto:club@myn8nservertest.ru"
EXISTING_WEB_PUSH_PUBLIC_KEY="$(ssh "$SSH_TARGET" "if [ -f '$DEPLOY_DIR/.env' ]; then grep -E '^WEB_PUSH_PUBLIC_KEY=' '$DEPLOY_DIR/.env' | tail -n 1 | cut -d= -f2-; fi" || true)"
EXISTING_WEB_PUSH_PRIVATE_KEY="$(ssh "$SSH_TARGET" "if [ -f '$DEPLOY_DIR/.env' ]; then grep -E '^WEB_PUSH_PRIVATE_KEY=' '$DEPLOY_DIR/.env' | tail -n 1 | cut -d= -f2-; fi" || true)"
WEB_PUSH_PUBLIC_KEY="${WEB_PUSH_PUBLIC_KEY:-$EXISTING_WEB_PUSH_PUBLIC_KEY}"
WEB_PUSH_PRIVATE_KEY="${WEB_PUSH_PRIVATE_KEY:-$EXISTING_WEB_PUSH_PRIVATE_KEY}"
WEB_PUSH_SUBJECT="${WEB_PUSH_SUBJECT:-$(prompt "Web Push contact" "mailto:$OWNER_EMAIL")}"

EXISTING_POSTGRES_PASSWORD="$(ssh "$SSH_TARGET" "if [ -f '$DEPLOY_DIR/.env' ]; then grep -E '^POSTGRES_PASSWORD=' '$DEPLOY_DIR/.env' | tail -n 1 | cut -d= -f2-; fi" || true)"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${EXISTING_POSTGRES_PASSWORD:-$(random_password)}}"
echo

echo "5. Демо-контент."
echo "Для тестового запуска лучше ответить y, чтобы сразу увидеть материалы в клубе."
RUN_SEED="${RUN_SEED:-$(prompt "Добавить демо-контент? y/n" "n")}"

CLONE_URL="$REPO_URL"
if [[ "$REPO_URL" == https://github.com/* && -n "$GITHUB_TOKEN" ]]; then
  CLONE_URL="${REPO_URL/https:\/\/github.com\//https:\/\/x-access-token:$GITHUB_TOKEN@github.com\/}"
fi

echo "Готовим $SSH_TARGET ..."

ssh "$SSH_TARGET" "set -e
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y git ca-certificates curl openssl

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
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git ca-certificates curl openssl
    if ! command -v docker >/dev/null 2>&1; then
      dnf install -y docker
    fi
    if ! docker compose version >/dev/null 2>&1; then
      dnf install -y docker-compose-plugin
    fi
    systemctl enable --now docker
  else
    echo 'Unsupported server OS. Install git, docker and docker compose plugin manually.' >&2
    exit 1
  fi
"

if [[ -z "$WEB_PUSH_PUBLIC_KEY" || -z "$WEB_PUSH_PRIVATE_KEY" ]]; then
  echo "Генерируем Web Push VAPID ключи..."
  GENERATED_VAPID_KEYS="$(generate_remote_vapid_keys)"
  WEB_PUSH_PUBLIC_KEY="$(printf '%s\n' "$GENERATED_VAPID_KEYS" | sed -n '1p')"
  WEB_PUSH_PRIVATE_KEY="$(printf '%s\n' "$GENERATED_VAPID_KEYS" | sed -n '2p')"

  if [[ -z "$WEB_PUSH_PUBLIC_KEY" || -z "$WEB_PUSH_PRIVATE_KEY" ]]; then
    echo "Не удалось сгенерировать Web Push VAPID ключи." >&2
    exit 1
  fi
fi

ssh "$SSH_TARGET" "set -e
  if [ -d '$DEPLOY_DIR/.git' ]; then
    git -C '$DEPLOY_DIR' pull --ff-only
  else
    mkdir -p '$DEPLOY_DIR'
    git clone '$CLONE_URL' '$DEPLOY_DIR'
    git -C '$DEPLOY_DIR' remote set-url origin '$REPO_URL'
  fi
"

ENV_FILE="$(mktemp)"
cat >"$ENV_FILE" <<ENV
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
WEB_PUSH_PUBLIC_KEY=$WEB_PUSH_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY=$WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT=$WEB_PUSH_SUBJECT
ENV

scp "$ENV_FILE" "$SSH_TARGET:$DEPLOY_DIR/.env"
rm -f "$ENV_FILE"
ssh "$SSH_TARGET" "chmod 600 '$DEPLOY_DIR/.env'"

ssh "$SSH_TARGET" "set -e
  cd '$DEPLOY_DIR'
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml run --rm migrate
  docker compose -f docker-compose.prod.yml up -d
"

if [[ "$RUN_SEED" == "y" || "$RUN_SEED" == "yes" ]]; then
  ssh "$SSH_TARGET" "set -e
    cd '$DEPLOY_DIR'
    docker compose -f docker-compose.prod.yml exec -T api pnpm --filter @club/api db:seed
  "
fi

echo
echo "Установка завершена."
echo "Web: $PUBLIC_WEB_URL"
echo "API health: $PUBLIC_API_URL/health"
echo "Обновление позже: ssh $SSH_TARGET 'DEPLOY_DIR=$DEPLOY_DIR bash $DEPLOY_DIR/deploy/update.sh'"
