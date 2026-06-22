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

echo
echo "Установка Telegram-клуба на удалённый сервер по SSH"
echo "Если значение в квадратных скобках подходит, просто нажмите Enter."
echo

REPO_URL="${REPO_URL:-$(prompt "GitHub repo URL репозитория" "https://github.com/vanechka1989/club-crm.git")}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
if [[ "$REPO_URL" == https://github.com/* && -z "$GITHUB_TOKEN" ]]; then
  GITHUB_TOKEN="$(prompt_secret "GitHub token для private repo")"
fi

echo "1. Сервер для установки."
SERVER_HOST="${SERVER_HOST:-$(prompt "IP сервера или домен SSH")}"
SERVER_USER="${SERVER_USER:-$(prompt "SSH пользователь" "root")}"
DEPLOY_DIR="${DEPLOY_DIR:-$(prompt "Папка установки на сервере" "/opt/club-crm")}"
SSH_TARGET="$SERVER_USER@$SERVER_HOST"
echo

echo "2. Публичные адреса."
echo "Для Telegram Mini App нужен HTTPS-домен. API работает на том же домене по пути /api."
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

echo "3. Telegram bot token из BotFather."
echo "Ввод скрыт: символы не будут отображаться."
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(prompt_secret "Telegram bot token")}"
echo

echo "4. Telegram ID администраторов."
echo "Главный админ уже задан по умолчанию: 593677751. Здесь можно добавить дополнительных админов."
OWNER_TELEGRAM_ID="${OWNER_TELEGRAM_ID:-593677751}"
ADMIN_TELEGRAM_IDS="${ADMIN_TELEGRAM_IDS:-$(prompt "Telegram ID админов" "")}"
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
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
OWNER_TELEGRAM_ID=$OWNER_TELEGRAM_ID
ADMIN_TELEGRAM_IDS=$ADMIN_TELEGRAM_IDS
ENV

scp "$ENV_FILE" "$SSH_TARGET:$DEPLOY_DIR/.env"
rm -f "$ENV_FILE"

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
