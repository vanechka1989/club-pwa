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
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y git ca-certificates curl openssl
    if ! command -v docker >/dev/null 2>&1; then
      dnf install -y docker
    fi
    if ! docker compose version >/dev/null 2>&1; then
      dnf install -y docker-compose-plugin
    fi
    systemctl enable --now docker
    return
  fi

  echo "ОС сервера не поддержана автоматически. Установите git, curl, openssl, docker и docker compose plugin вручную." >&2
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

echo
echo "Установка PWA-клуба"
echo "Если значение в квадратных скобках подходит, просто нажмите Enter."
echo
echo "Перед началом подготовьте:"
echo "- домен для PWA с A-записью на IP сервера, например club2.myn8nservertest.ru"
echo "- email владельца клуба, например owner@example.com"
echo "- SMTP-ящик для кодов входа, например club@myn8nservertest.ru"
echo "- SMTP пример Timeweb: host smtp.timeweb.ru, port 465, user полный ящик, password пароль от ящика"
echo "- PWA push-ключи создаются автоматически, вручную их готовить не нужно"
echo

REPO_URL="${REPO_URL:-https://github.com/vanechka1989/club-pwa.git}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_DEPLOY_DIR="/opt/club-pwa"
if [[ -d "$REPO_ROOT/.git" ]]; then
  DEFAULT_DEPLOY_DIR="$REPO_ROOT"
fi

GITHUB_TOKEN="${GITHUB_TOKEN:-}"

echo "1. Папка установки на сервере."
echo "Обычно оставляем стандартную: /opt/club-pwa"
DEPLOY_DIR="${DEPLOY_DIR:-$(prompt "Папка установки" "$DEFAULT_DEPLOY_DIR")}"
echo

echo "2. IP сервера или домен."
echo "Для теста укажите IPv4 сервера, например: 107.173.123.8"
SERVER_HOST="${SERVER_HOST:-$(prompt "IP сервера или домен" "$(hostname -I 2>/dev/null | awk '{print $1}')")}"
echo

DEFAULT_PUBLIC_DOMAIN="$SERVER_HOST"
if [[ "$DEFAULT_PUBLIC_DOMAIN" == http://* ]]; then
  DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN#http://}"
fi
if [[ "$DEFAULT_PUBLIC_DOMAIN" == https://* ]]; then
  DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN#https://}"
fi
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN%%/*}"
DEFAULT_PUBLIC_DOMAIN="${DEFAULT_PUBLIC_DOMAIN%.}"

echo "2.1. Домен для HTTPS."
echo "Для PWA нужен HTTPS. Укажите домен без http/https, например: club.example.com"
echo "Если домена нет и вы вводите IP, HTTPS-сертификат автоматически не выпустится."
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-$(prompt "Домен для HTTPS" "$DEFAULT_PUBLIC_DOMAIN")}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN%.}"
echo

echo "3. Адрес frontend."
echo "Для домена используйте: https://$PUBLIC_DOMAIN"
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-$(prompt "Web URL" "https://$PUBLIC_DOMAIN")}"
echo

echo "4. Адрес API."
echo "API будет доступен на том же домене по пути /api."
PUBLIC_API_URL="${PUBLIC_API_URL:-$(prompt "API URL" "https://$PUBLIC_DOMAIN/api")}"
echo

echo "5. Email-доступ."
OWNER_EMAIL="${OWNER_EMAIL:-$(prompt "Email владельца клуба")}"
ADMIN_EMAILS="${ADMIN_EMAILS:-$(prompt "Дополнительные email админов через запятую" "")}"
echo

echo "5.1. SMTP для кодов входа."
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

echo "5.2. Web Push VAPID ключи."
echo "PWA push-ключи создаются автоматически, вручную их готовить не нужно."
echo "Контакт обычно выглядит так: mailto:club@myn8nservertest.ru"
EXISTING_WEB_PUSH_PUBLIC_KEY="$(existing_env_value "$DEPLOY_DIR/.env" WEB_PUSH_PUBLIC_KEY || true)"
EXISTING_WEB_PUSH_PRIVATE_KEY="$(existing_env_value "$DEPLOY_DIR/.env" WEB_PUSH_PRIVATE_KEY || true)"
WEB_PUSH_PUBLIC_KEY="${WEB_PUSH_PUBLIC_KEY:-$EXISTING_WEB_PUSH_PUBLIC_KEY}"
WEB_PUSH_PRIVATE_KEY="${WEB_PUSH_PRIVATE_KEY:-$EXISTING_WEB_PUSH_PRIVATE_KEY}"
WEB_PUSH_SUBJECT="${WEB_PUSH_SUBJECT:-$(prompt "Web Push contact" "mailto:$OWNER_EMAIL")}"
echo

EXISTING_POSTGRES_PASSWORD="$(existing_env_value "$DEPLOY_DIR/.env" POSTGRES_PASSWORD || true)"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${EXISTING_POSTGRES_PASSWORD:-$(random_password)}}"

echo "6. Демо-контент."
echo "Для тестового запуска лучше ответить y, чтобы сразу увидеть материалы в клубе."
RUN_SEED="${RUN_SEED:-$(prompt "Добавить демо-контент? y/n" "n")}"

CLONE_URL="$REPO_URL"
if [[ "$REPO_URL" == https://github.com/* && -n "$GITHUB_TOKEN" ]]; then
  CLONE_URL="${REPO_URL/https:\/\/github.com\//https:\/\/x-access-token:$GITHUB_TOKEN@github.com\/}"
fi

echo
echo "Устанавливаем системные пакеты и Docker..."
install_packages
ensure_vapid_keys

echo
echo "Готовим репозиторий в $DEPLOY_DIR..."
if [[ -d "$DEPLOY_DIR/.git" ]]; then
  git -C "$DEPLOY_DIR" pull --ff-only
else
  mkdir -p "$DEPLOY_DIR"
  git clone "$CLONE_URL" "$DEPLOY_DIR"
  if [[ "$REPO_URL" == https://github.com/* ]]; then
    git -C "$DEPLOY_DIR" remote set-url origin "$REPO_URL"
  fi
fi

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
WEB_PUSH_PUBLIC_KEY=$WEB_PUSH_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY=$WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT=$WEB_PUSH_SUBJECT
ENV
chmod 600 "$DEPLOY_DIR/.env"

cd "$DEPLOY_DIR"

echo
echo "Собираем Docker images..."
docker compose -f docker-compose.prod.yml build

echo
echo "Применяем миграции базы данных..."
docker compose -f docker-compose.prod.yml run --rm migrate

echo
echo "Запускаем сервисы..."
docker compose -f docker-compose.prod.yml up -d

if [[ "$RUN_SEED" == "y" || "$RUN_SEED" == "yes" ]]; then
  echo
  echo "Добавляем демо-контент..."
  docker compose -f docker-compose.prod.yml exec -T api pnpm --filter @club/api db:seed
fi

docker compose -f docker-compose.prod.yml ps

echo
echo "Установка завершена."
echo "Web: $PUBLIC_WEB_URL"
echo "API health: $PUBLIC_API_URL/health"
echo "Обновление позже: DEPLOY_DIR=$DEPLOY_DIR bash $DEPLOY_DIR/deploy/update.sh"
