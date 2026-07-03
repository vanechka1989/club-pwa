# Шаблон Telegram-клуба

Шаблон платного закрытого клуба внутри Telegram mini app. Первая версия намеренно небольшая, чтобы проект было легко запускать, развивать и переносить под разные клубы.

- Backend: Bun, Hono, TypeScript strict, Zod, Drizzle ORM, PostgreSQL, pino.
- Frontend: Vue 3, Vite, Pinia, ofetch, Tailwind CSS 4.
- Общий пакет: Zod-схемы и TypeScript-типы для API и frontend.
- План развития: профиль, обучение, оплата, поддержка и минимальная цель 1000 зарегистрированных пользователей.

Пока не добавлены в стартовый шаблон: Redis, BullMQ, S3/Garage, `jose`, Argon2 и rate limiter. Их стоит подключать тогда, когда появятся очереди, загрузка файлов, отдельные web-сессии, пароли или публичные endpoints с риском злоупотреблений.

## Быстрый Старт

Нужно установить: `pnpm`, `bun` и Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Web-приложение откроется на `http://localhost:5173`.

План проекта хранится в [PROJECT_PLAN.md](./PROJECT_PLAN.md).
Текущая архитектура описана в [ARCHITECTURE.md](./ARCHITECTURE.md).

## Локальный Режим Без Telegram

Для разработки в обычном браузере можно включить dev-auth:

```env
DEV_AUTH_ENABLED=true
VITE_DEV_TELEGRAM_USER={"id":"1001","firstName":"Ivan","username":"ivan"}
```

В этом режиме frontend отправляет заголовок `X-Dev-Telegram-User`, а API принимает его только при `NODE_ENV=development` и `DEV_AUTH_ENABLED=true`. В production этот режим не работает, там остаётся обязательная проверка Telegram `initData`.

Seed-данные для категорий и первых материалов:

```bash
pnpm db:seed
```

Команда требует запущенный PostgreSQL и применённые миграции.

## Установка На Сервер

Основной сценарий для нового клиента: зайти на чистый VPS по SSH и вставить одну команду. Она не требует токена GitHub: сервер скачает готовые Docker-образы шаблонного клуба, создаст настройки, применит миграции, выпустит HTTPS-сертификат через Caddy и запустит приложение.

```bash
curl -fsSL https://club.myn8nservertest.ru/install-club.sh | bash
```

Установщик спросит:

- папку установки;
- домен клиента;
- адрес клуба;
- токен Telegram-бота из BotFather;
- Telegram ID владельца;
- дополнительных админов;
- добавлять ли базовый демо-контент.

Важно: Docker-образы должны быть публичными в реестре контейнеров GitHub:

- `ghcr.io/vanechka1989/club-crm-api`
- `ghcr.io/vanechka1989/club-crm-web`

После первого запуска GitHub Actions `Публикация образов шаблонного клуба` нужно один раз сделать эти образы публичными в GitHub: `Repository -> Packages -> package -> Package settings -> Change visibility -> Public`.

Для Telegram Mini App нужен HTTPS-домен. API публикуется на том же домене по пути `/api`:

```text
Web: https://club.example.com
API: https://club.example.com/api
Health: https://club.example.com/api/health
```

После установки обновление на сервере:

```bash
bash /opt/club-crm/update.sh
```

## Админка

Админка открывается внутри того же Telegram Mini App. Главный админ задаётся переменной `OWNER_TELEGRAM_ID`; по умолчанию это Telegram ID `593677751`. Нижняя вкладка `Админ` появляется у владельца и у пользователей, добавленных в админы.

Как проверить или изменить владельца:

1. Узнать свой числовой Telegram ID, например через бота `@userinfobot`.
2. На сервере открыть `/opt/club-crm/.env`.
3. Проверить строку:

```env
OWNER_TELEGRAM_ID=593677751
```

Дополнительных админов можно добавлять и удалять прямо во вкладке `Админ`. Владелец не удаляется из вебки, чтобы случайно не потерять доступ.

Для ручного добавления через `.env` всё ещё можно использовать:

```env
ADMIN_TELEGRAM_IDS=123456789,987654321
```

После изменения `.env` перезапустить сервисы:

```bash
cd /opt/club-crm
docker compose -f docker-compose.prod.yml up -d
```

После этого открыть mini app в Telegram заново. В нижнем меню появится вкладка `Админ`.

У владельца есть режим просмотра mini app:

- `Как есть` - реальное состояние аккаунта.
- `Без доступа` - посмотреть клуб глазами пользователя без подписки.
- `Купил доступ` - посмотреть клуб глазами пользователя с активной подпиской.

Этот режим не меняет реальные подписки и работает только для `OWNER_TELEGRAM_ID`.

## Интерфейс

Frontend поддерживает русский и английский язык, переключение темы день/ночь и нижнее меню, удобное для Telegram Mini App. Выбранный язык и тема сохраняются в браузере пользователя.

## Прогресс Уроков

Приложение запоминает последний открытый урок пользователя и позволяет отметить материал как пройденный. В разделе обучения показывается прогресс: сколько материалов пройдено и какой урок был открыт последним.

## Управление Доступом

Во вкладке `Админ` можно смотреть статистику клиентов, искать клиента по Telegram ID, видеть прогресс уроков и вручную менять доступ: выдать, забрать или выставить дату окончания подписки.

Дополнительный сценарий: установка с локальной машины на сервер по SSH.

```bash
read -rs GITHUB_TOKEN
bash <(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" https://raw.githubusercontent.com/vanechka1989/club-crm/main/deploy/install.sh)
```

## Проверки

```bash
pnpm check
pnpm test
pnpm test:e2e
```

## Поток Telegram Mini App

Frontend отправляет Telegram `initData` в заголовке `Authorization: tma <initData>`.
API проверяет подпись через `TELEGRAM_BOT_TOKEN`, создаёт или обновляет Telegram-пользователя и возвращает статус подписки.

При локальной разработке вне Telegram приложение показывает состояние без авторизации, потому что подписанного Telegram `initData` в обычном браузере нет.
