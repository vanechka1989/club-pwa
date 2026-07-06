# План Проекта

Это рабочий план PWA для платного закрытого клуба. Его нужно обновлять по мере того, как меняются продуктовые решения и приоритеты.

## Цель Продукта

Сделать переиспользуемый шаблон PWA для закрытого клуба по подписке:

- Пользователи открывают PWA по HTTPS-домену и могут установить его на устройство.
- Приложение проверяет email-вход через одноразовый код и cookie-сессию.
- Пользователь видит статус своей подписки.
- Неактивный пользователь может перейти к оплате подписки.
- Активный участник получает доступ к приватному контенту и обучающим материалам.
- Участник может управлять профилем, оплатой и обращениями в поддержку внутри PWA.
- Шаблон остаётся достаточно простым, чтобы его можно было адаптировать под разные клубы.

## Нефункциональные Требования

- Клуб должен уверенно выдерживать минимум 1000 зарегистрированных пользователей.
- Перед production-запуском нужно определить: registered users, daily active users, peak concurrent users и expected requests per second.
- API должен оставаться stateless, чтобы его можно было масштабировать горизонтально.
- Индексы PostgreSQL должны покрывать email identity, поиск подписки и списки контента.
- Тяжёлые медиа должны отдаваться из object storage/CDN, а не через API-процесс.
- Фоновые задачи нужно переносить в Redis/BullMQ, когда появятся платежи, уведомления, обработка медиа или scheduled-задачи.
- Перед запуском нужен load test основных потоков: открыть PWA, прочитать профиль, получить список категорий обучения, открыть материал и начать checkout.

## Текущий Scope

Первая версия включает только основу, которая нужна для рабочего фундамента:

- Backend: TypeScript strict, Bun, Hono, Zod, Drizzle ORM, PostgreSQL, pino.
- Frontend: Vue 3, Composition API, `<script setup>`, Vite, Pinia, ofetch, Tailwind CSS 4, typography plugin.
- DevOps: Docker Compose для PostgreSQL, pnpm workspaces.
- Testing: Vitest, Testing Library for Vue, Playwright, axe-core.

Отложено до конкретной необходимости:

- Redis и BullMQ для фоновых задач.
- S3-compatible storage и Garage для файлов/медиа.
- Cookie-сессии для browser/PWA identity.
- `@node-rs/argon2` для паролей или похожих секретов.
- `rate-limiter-flexible` для публичных endpoints с риском злоупотреблений.

## Определение MVP

MVP - это минимальная версия, которую можно запустить для реальных платящих участников:

- PWA стабильно открывается по HTTPS-домену.
- Email-сессия проверяется на каждом защищённом API-запросе.
- У участника есть профиль со статусом подписки и датой окончания доступа.
- Неактивный пользователь может открыть вкладку оплаты и начать subscription flow.
- Payment webhooks могут активировать или продлевать доступ.
- Активные участники могут смотреть категории обучения.
- Активные участники могут открывать текстовые, фото и видео материалы.
- Неактивные или просроченные пользователи видят понятный экран доступа вместо приватного контента.
- Пользователь может обратиться в поддержку через выбранный канал.
- Администратор может создавать категории и контент без ручного редактирования базы данных.
- Приложение можно установить из закрытого GitHub-репозитория на VPS.
- Документации достаточно, чтобы восстановиться из backup и redeploy.

Не входит в MVP:

- Multi-club tenancy.
- Сложный progress tracking по курсам.
- Публичные landing pages.
- Нативные мобильные приложения.
- Продвинутая аналитика.
- Инструменты модерации community/chat.

## Разделы Продукта

PWA должен быть организован вокруг этих разделов первого уровня:

- Профиль - email identity, статус подписки, окончание доступа, заметки по аккаунту.
- Обучение - категории, текстовые уроки, фото-материалы, видео-уроки.
- Оплата - текущий тариф, checkout, статус продления, позже история оплат.
- Поддержка - темы поддержки, контактный канал или in-app ticket form.
- Админка - скрыта от обычных участников; контент, участники, платежи и поддержка.

## Следующий Порядок Работ

Дальше разработку лучше вести в таком порядке:

1. Сделать локальную разработку надёжной: зависимости, lockfile, миграции, seed data и email dev mode.
2. Доделать правила доступа: active-only guard, экран неактивного участника, content detail endpoint и UI.
3. Выбрать и реализовать платёжного провайдера: checkout, webhook verification, активация подписки.
4. Добавить базовые admin operations: ручная выдача доступа, поиск участников, управление категориями и контентом.
5. Усилить production installer: HTTPS, миграции, backups, update/rollback command.
6. Добавить load testing и production sizing под цель 1000 пользователей.

## Открытые Продуктовые Решения

- Какой платёжный провайдер будет первым: YooKassa, Stripe, CloudPayments, Prodamus или manual approval?
- Поддержка будет через in-app tickets или внешний канал менеджера?
- Админка живёт внутри PWA как скрытая вкладка для владельца из `OWNER_EMAIL` и админов из базы/`ADMIN_EMAILS`.
- Где будут храниться фото и видео: S3-compatible storage, Garage или внешний video hosting?
- Модель доступа: разовая покупка, месячная подписка, годовая подписка или несколько тарифов?
- Progress tracking нужен: приложение хранит последний открытый урок и отметку прохождения.

## Milestones

### 1. Фундамент

Статус: in progress

- [x] Создать pnpm workspace structure.
- [x] Добавить API app.
- [x] Добавить web app.
- [x] Добавить общие Zod-схемы.
- [x] Добавить PostgreSQL Docker Compose service.
- [x] Добавить email-вход с cookie-сессией.
- [x] Добавить схемы пользователей и подписок.
- [x] Добавить базовый endpoint статуса подписки.
- [x] Добавить frontend membership shell.
- [x] Добавить unit и e2e smoke tests.
- [x] Добавить первый navigation shell для profile, learning, payment и support.
- [x] Добавить нижнее меню для PWA.
- [x] Добавить переключение русского/английского языка.
- [x] Добавить переключение тёмной/светлой темы.
- [x] Установить зависимости и создать lockfile.
- [x] Запустить `pnpm check`.
- [x] Запустить `pnpm test`.
- [x] Запустить `pnpm test:e2e`.

### 2. Локальная Разработка

Статус: planned

- [x] Добавить первую database migration в репозиторий.
- [x] Добавить seed script для локальной разработки.
- [x] Добавить local email dev mode для разработки в обычном браузере.
- [ ] Добавить typed API error shape.
- [ ] Добавить README-раздел по настройке PWA install и SMTP.
- [ ] Добавить `.env.test` guidance.

### 3. Подписка И Оплата

Статус: planned

- [ ] Выбрать первого платёжного провайдера.
- [ ] Определить subscription plans.
- [ ] Реализовать checkout session creation.
- [ ] Реализовать provider webhook verification.
- [ ] Хранить payment provider IDs.
- [ ] Активировать или продлевать подписки из webhook events.
- [ ] Добавить обработку expiration подписки.
- [ ] Добавить tests для checkout и webhook flows.

### 4. Кабинет Участника И Обучение

Статус: planned

- [x] Определить content types: text, photo и video.
- [x] Определить learning categories.
- [x] Добавить database schema для content categories.
- [x] Добавить database schema для content items.
- [ ] Добавить media attachment model.
- [x] Добавить content listing endpoint.
- [x] Добавить content detail endpoint.
- [x] Добавить member-only API guard.
- [x] Добавить member dashboard screen.
- [x] Добавить profile screen.
- [x] Добавить первый learning section screen.
- [ ] Добавить content item screen для text/photo/video.
- [x] Добавить payment screen.
- [x] Добавить support screen.
- [x] Добавить первый inactive/expired access screen для закрытых материалов.
- [x] Добавить last opened lesson tracking.
- [x] Добавить отметку пройденных уроков и прогресс участника.
- [ ] Добавить admin-managed content model, если понадобится.

### 5. Поддержка

Статус: planned

- [ ] Выбрать первый support channel: in-app tickets, email или external helpdesk.
- [ ] Добавить support topic categories.
- [x] Добавить начальную database model для support requests.
- [ ] Детализировать support request model, если выбираем in-app tickets.
- [ ] Добавить endpoint создания обращения.
- [ ] Добавить support request status tracking.
- [ ] Добавить admin support queue, если поддержка управляется внутри app.

### 6. Администрирование

Статус: in progress

- [x] Решить, где живёт админка: внутри PWA, в web или сначала в CLI scripts.
- [x] Добавить admin role model.
- [x] Добавить первую скрытую вкладку админки в PWA.
- [x] Добавить главного админа `OWNER_EMAIL`.
- [x] Добавить управление дополнительными админами из PWA.
- [x] Добавить owner preview: просмотр как пользователь без доступа или с активной подпиской.
- [x] Добавить ручную выдачу/отзыв подписки.
- [x] Добавить поиск участников.
- [x] Добавить просмотр статистики клиентов и прогресса уроков.
- [ ] Добавить управление категориями контента.
- [ ] Добавить редактор обучающих материалов text/photo/video.
- [ ] Добавить basic audit log для изменений подписки.

### 7. Производительность И Масштабирование

Статус: planned

- [ ] Уточнить launch load profile: registered users, daily active users, peak concurrent users и target RPS.
- [ ] Добавить load-test сценарии для auth, profile, learning list, content detail и checkout start.
- [ ] Добавить/проверить database indexes для content category и subscription queries.
- [ ] Добавить pagination для списков обучающего контента.
- [ ] Добавить API response caching strategy для public/member content lists.
- [ ] Добавить connection pool sizing guidance для Bun API и PostgreSQL.
- [ ] Добавить Docker Compose profile для локального performance testing.
- [ ] Документировать минимальную конфигурацию сервера для 1000 пользователей.

### 8. Production Readiness

Статус: planned

- [x] Добавить первый production Docker Compose stack.
- [x] Добавить первый GitHub raw-link installer script.
- [x] Поддержать установку из private GitHub repo через token prompt.
- [x] Добавить deployment Dockerfiles.
- [x] Добавить server-side install command для запуска прямо на VPS.
- [ ] Добавить rate limiting для auth-sensitive и payment-sensitive endpoints.
- [ ] Добавить structured request IDs.
- [ ] Добавить health/readiness endpoints.
- [x] Добавить domain и HTTPS automation.
- [x] Добавить запуск миграций в installer.
- [x] Добавить update command для серверов.
- [ ] Добавить rollback command для серверов.
- [ ] Добавить production environment checklist.
- [ ] Добавить database backup guidance.
- [ ] Добавить observability guidance для logs и errors.

### 9. Optional Growth Features

Статус: backlog

- [ ] Добавить Redis, когда rate limiting, caching или jobs потребуют shared state.
- [ ] Добавить BullMQ для email/PWA notifications, retries, imports или scheduled work.
- [ ] Добавить S3/Garage для member files, videos или downloadable assets.
- [x] Добавить browser/PWA session.
- [ ] Добавить Argon2, если будут храниться passwords или invite-code secrets.
- [ ] Добавить invite/referral system.
- [ ] Добавить multi-club tenancy, если это станет template platform.

## Технические Решения

- Email-код и cookie-сессия - основной identity proof для PWA.
- PostgreSQL - источник истины для пользователей и подписок.
- Shared package хранит API-facing schemas и TypeScript types.
- Первый платёжный провайдер пока не выбран.
- Frontend должен оставаться реальным app screen, а не marketing landing page.
- Новую инфраструктуру добавляем только тогда, когда milestone создаёт реальный use case.

## Как Обновлять План

Когда добавляется новая работа:

1. Ближайшие implementation tasks добавлять в подходящий milestone.
2. Неопределённые идеи складывать в Optional Growth Features.
3. Переносить отложенные stack items в Current Scope только тогда, когда код начинает их использовать.
4. Держать checkboxes достаточно маленькими, чтобы каждый можно было закрыть за одно сфокусированное изменение.
5. Обновлять статусы до или после значимой implementation work.
