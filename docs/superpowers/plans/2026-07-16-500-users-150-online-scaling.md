# План реализации масштабирования до 500 / 150

> Реализовать по шагам с тестом до изменения кода и полной проверкой перед production.

**Цель:** уменьшенная фоновая нагрузка на текущем VPS и готовый, но не активированный профиль из двух stateless API-реплик, worker, Redis и PgBouncer.

## 1. Уменьшить нагрузку авторизации на PostgreSQL

**Файлы:**
- изменить `apps/api/src/middleware/auth.ts`;
- добавить `apps/api/src/middleware/authScaling.test.ts`.

**Шаги:**
1. Тестом зафиксировать обновление `lastSeenAt` только для устаревшей активности и отсутствие owner-запроса без preview.
2. Добавить порог активности пять минут через условный SQL update.
3. Вычислять owner только при preview mode/membership header.
4. Запустить API-тесты и typecheck.

## 2. Снизить и распределить клиентский polling

**Файлы:**
- изменить `apps/web/src/App.vue`;
- изменить `apps/web/src/features/support/SupportSection.vue`;
- добавить `apps/web/src/appPollingScaling.test.ts`.

**Шаги:**
1. Тестом зафиксировать интервалы и остановку фонового polling при hidden document.
2. Увеличить session до 60 секунд, support/notifications до 30 секунд, добавить jitter.
3. Не выполнять циклический refresh в background; при visibility change обновлять сразу.
4. Увеличить polling открытой поддержки до 15 секунд.
5. Запустить web-тесты и typecheck.

## 3. Добавить Redis realtime между API-репликами

**Файлы:**
- изменить `apps/api/package.json`, `pnpm-lock.yaml`;
- изменить `apps/api/src/env.ts`;
- добавить `apps/api/src/redis/client.ts`;
- изменить `apps/api/src/community/realtime.ts`;
- добавить `apps/api/src/community/realtimeRedis.test.ts`.

**Шаги:**
1. Тестом зафиксировать UUID событий, локальную доставку и Redis publish/subscribe.
2. Добавить опциональный `REDIS_URL` и Redis-клиенты с reconnect.
3. Подписать процесс на общий channel; не дублировать локально опубликованное событие.
4. Сохранить in-memory fallback для тестов и локальной разработки.
5. Запустить API-тесты и typecheck.

## 4. Отделить фоновые задания от HTTP API

**Файлы:**
- изменить `apps/api/src/env.ts`;
- изменить `apps/api/src/index.ts`;
- добавить `apps/api/src/backgroundJobs.ts`;
- добавить `apps/api/src/backgroundJobs.test.ts`.

**Шаги:**
1. Тестом зафиксировать, что jobs запускаются только при `RUN_BACKGROUND_JOBS=true`.
2. Собрать запуск/остановку трёх задач в одном модуле.
3. На API-репликах выключить jobs, на worker включить.
4. Запустить API-тесты и typecheck.

## 5. Подготовить production compose для двух API, worker, Redis и PgBouncer

**Файлы:**
- изменить `docker-compose.prod.yml`;
- изменить `deploy/Caddyfile`;
- добавить `deploy/pgbouncer/pgbouncer.ini`;
- изменить `.env.example`;
- добавить `tests/infrastructure/productionCompose.test.ts`.

**Шаги:**
1. Тестом проверить наличие двух API upstream, worker, Redis, PgBouncer и прямого migration URL.
2. Добавить healthchecks и зависимости.
3. Подключить API/worker к PgBouncer, migration напрямую к Postgres.
4. Настроить Caddy load balancing между API-репликами.
5. Проверить `docker compose config`.

## 6. Добавить readiness и нагрузочный сценарий

**Файлы:**
- изменить `apps/api/src/index.ts`;
- добавить `apps/api/src/readiness.ts`;
- добавить `apps/api/src/readiness.test.ts`;
- добавить `tests/load/club-150.js`;
- добавить `tests/load/README.md`.

**Шаги:**
1. Тестом зафиксировать PostgreSQL/Redis readiness.
2. Добавить `/ready` с 503 при недоступной обязательной зависимости.
3. Добавить k6-сценарий с параметризуемыми cookies и тремя профилями нагрузки.
4. Описать безопасный запуск ступенями 50/100/150 без случайного запуска по production.

## 7. Релиз и production-проверка

**Файлы:**
- обновить версию приложения до 4.65;
- обновить PWA cache version и release notes.

**Шаги:**
1. Запустить все unit/integration тесты, typecheck и build.
2. Проверить compose config и локальные healthchecks.
3. Закоммитить и отправить `main`.
4. Дождаться production deploy; проверить версию, `/health`, `/ready`, `/metrics` и одну текущую API-реплику.
5. Выполнить лёгкий smoke-test без высокой нагрузки.
6. Проверить конфигурацию `docker-compose.scale.yml`, не запуская её на текущем VPS.
7. Отдельно сообщить, что гарантия 150 online наступает после увеличения VPS до 8 vCPU/16 ГБ и прохождения ступенчатого k6-теста.
