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

echo
echo "Установка Telegram-клуба"
echo "Если значение в квадратных скобках подходит, просто нажмите Enter."
echo

REPO_URL="${REPO_URL:-https://github.com/vanechka1989/club.git}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_DEPLOY_DIR="/opt/telegram-club"
if [[ -d "$REPO_ROOT/.git" ]]; then
  DEFAULT_DEPLOY_DIR="$REPO_ROOT"
fi

GITHUB_TOKEN="${GITHUB_TOKEN:-}"

echo "1. Папка установки на сервере."
echo "Обычно оставляем стандартную: /opt/telegram-club"
DEPLOY_DIR="${DEPLOY_DIR:-$(prompt "Папка установки" "$DEFAULT_DEPLOY_DIR")}"
echo

echo "2. IP сервера или домен."
echo "Для теста укажите IPv4 сервера, например: 107.174.51.158"
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
echo "Для Telegram Mini App нужен HTTPS. Укажите домен без http/https, например: club.example.com"
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

echo "5. Telegram bot token из BotFather."
echo "Ввод скрыт: символы не будут отображаться."
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(prompt_secret "Telegram bot token")}"
echo

echo "5.1. Telegram ID администраторов."
echo "Главный админ уже задан по умолчанию: 593677751. Здесь можно добавить дополнительных админов."
OWNER_TELEGRAM_ID="${OWNER_TELEGRAM_ID:-593677751}"
ADMIN_TELEGRAM_IDS="${ADMIN_TELEGRAM_IDS:-$(prompt "Telegram ID админов" "")}"
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

echo
echo "Готовим репозиторий в $DEPLOY_DIR..."
if [[ -d "$DEPLOY_DIR/.git" ]]; then
  git -C "$DEPLOY_DIR" pull --ff-only
else
  if [[ "$REPO_URL" == https://github.com/* && -z "$GITHUB_TOKEN" ]]; then
    echo "GitHub token нужен только если репозиторий ещё не склонирован по SSH."
    GITHUB_TOKEN="$(prompt_secret "GitHub token для private repo")"
    CLONE_URL="${REPO_URL/https:\/\/github.com\//https:\/\/x-access-token:$GITHUB_TOKEN@github.com\/}"
  fi

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
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
OWNER_TELEGRAM_ID=$OWNER_TELEGRAM_ID
ADMIN_TELEGRAM_IDS=$ADMIN_TELEGRAM_IDS
ENV

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
