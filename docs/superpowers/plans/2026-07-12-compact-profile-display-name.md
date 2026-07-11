# Компактный профиль и единый ник — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пересобрать профиль в компактной компоновке и добавить уникальный отображаемый ник с одной самостоятельной сменой и дальнейшим управлением через администратора.

**Architecture:** Отдельные поля пользователя хранят отображаемый ник и факт самостоятельной смены. Общий shared helper задаёт единый приоритет имени, API возвращает актуального автора из таблицы пользователей, а профиль и карточка клиента используют отдельные endpoints изменения ника.

**Tech Stack:** Vue 3, Pinia, TypeScript, Hono, Drizzle ORM, PostgreSQL, Zod, Vitest.

## Global Constraints

- Ник уникален без учёта регистра, содержит 3–20 русских/латинских букв, цифр, `_` или `-`.
- Пользователь меняет ник самостоятельно один раз; административная смена право не восстанавливает.
- Авторизация, email, Telegram username, ID, роли и бизнес-логика подписок не изменяются.
- Интерфейс поддерживает четыре темы, ширину от 320 px, safe-area и цели нажатия от 44 px.

---

### Task 1: Модель данных и общая логика имени

**Files:**
- Create: `apps/api/drizzle/0036_user_display_name.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/displayName.ts`
- Create: `packages/shared/src/displayName.test.ts`

**Interfaces:**
- Produces: `normalizeDisplayName(value)`, `validateDisplayName(value)`, `resolveDisplayName(user)`; поля `displayName` и `displayNameChangedByUserAt`.

- [ ] Написать тесты нормализации, допустимых символов, регистра и fallback-приоритета.
- [ ] Запустить `pnpm --filter @club/shared test -- displayName.test.ts` и подтвердить падение.
- [ ] Добавить helper, shared-схемы, колонки и уникальный индекс `lower(display_name)`.
- [ ] Повторно запустить тест и получить PASS.

### Task 2: Пользовательское изменение ника

**Files:**
- Modify: `apps/api/src/routes/me.ts`
- Create: `apps/api/src/profile/displayName.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/stores/session.ts`

**Interfaces:**
- Produces: `PATCH /me/display-name` с `{ displayName }`; session action `updateDisplayName(displayName)`.

- [ ] Написать тесты первой смены, повторного запрета, формата и конфликта уникальности.
- [ ] Запустить профильные API-тесты и подтвердить падение.
- [ ] Реализовать транзакционное обновление `displayName` и `displayNameChangedByUserAt`, ответы 400/403/409.
- [ ] Добавить типизированный client и обновление `session.user` из ответа.
- [ ] Запустить API/shared тесты и получить PASS.

### Task 3: Единое имя в сообщениях и остальных API

**Files:**
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/api/src/routes/support.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/referrals/referrals.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/admin/adminStatistics.ts`

**Interfaces:**
- Consumes: `resolveDisplayName(user)` и shared-поля `displayName`.
- Produces: одинаковое актуальное имя во всех авторах и карточках.

- [ ] Добавить тест, что `displayName` имеет приоритет над firstName/username в старом сообщении.
- [ ] Обновить API mappers и UI formatter без копирования ника в записи сообщений.
- [ ] Запустить community/support/admin тесты и получить PASS.

### Task 4: Административная смена ника

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/admin/actionLog.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminClientCard.test.ts`

**Interfaces:**
- Produces: `PATCH /admin/users/:telegramId/display-name`, проверка права `clients`, запись старого и нового значения в action log.

- [ ] Написать тесты разрешённой смены, 409, отсутствия права и сохранения использованного пользовательского права.
- [ ] Реализовать endpoint и журналирование.
- [ ] Добавить компактную inline-форму «Ник» в карточку клиента.
- [ ] Запустить admin API/web тесты и получить PASS.

### Task 5: Компактный профиль

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`
- Modify: `apps/web/src/features/ui/foundation.css`
- Create: `apps/web/src/features/profile/profileDisplayName.test.ts`

**Interfaces:**
- Consumes: `session.updateDisplayName()` и поля пользователя.
- Produces: компактная identity-card, объединённая строка доступа, bottom sheet изменения ника.

- [ ] Написать source/component тесты компоновки, одноразового состояния и inline-ошибок.
- [ ] Собрать верхний блок с крупным аватаром, ником и карандашом.
- [ ] Объединить название доступа, дату, остаток дней и progress; удалить дублирующие плашки.
- [ ] Добавить bottom sheet «Изменить ник» и заблокированное состояние после первой смены.
- [ ] Проверить 320/360/390/412/768 px и четыре темы.

### Task 6: Релиз и проверка

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] Запустить целевые тесты shared/api/web.
- [ ] Запустить typecheck/build web и API.
- [ ] Обновить версию и service-worker cache.
- [ ] Закоммитить, отправить main, развернуть production.
- [ ] Проверить health, production assets, миграцию, версию и заполнение диска.
