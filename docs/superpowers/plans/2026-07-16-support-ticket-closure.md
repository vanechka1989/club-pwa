# Support Ticket Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полностью закрывать экран обращения и сохранять пользователя и время закрытия.

**Architecture:** `support_tickets` получает nullable-метаданные закрытия. API устанавливает их вместе со статусом и возвращает в общем `SupportTicket`; Vue после успешного ответа обновляет список и закрывает routed TaskScreen.

**Tech Stack:** PostgreSQL, Drizzle ORM, Hono, Zod, Vue 3, Vue Router, Vitest.

## Global Constraints

- Старые закрытые обращения без метаданных продолжают читаться.
- Ошибка закрытия не должна закрывать экран обращения.
- Имя закрывшего отображается в русском и английском интерфейсе.

---

### Task 1: Метаданные закрытия в БД и общем контракте

**Files:**
- Create: `apps/api/drizzle/0044_support_ticket_closure.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/support/ticketClosureSchema.test.ts`

**Interfaces:**
- Produces: `SupportTicket.closedAt: string | null` и `SupportTicket.closedBy: SupportTicketUser | null`.

- [ ] Написать тест, проверяющий наличие `closed_at`, `closed_by_user_id` и nullable-полей Zod-контракта.
- [ ] Запустить `pnpm --filter @club/api exec vitest run src/support/ticketClosureSchema.test.ts` и получить ожидаемый FAIL.
- [ ] Добавить миграцию, поля Drizzle и Zod-поля.
- [ ] Повторить тест и получить PASS.

### Task 2: Запись закрывающего пользователя в API

**Files:**
- Modify: `apps/api/src/routes/support.ts`
- Test: `apps/api/src/support/ticketClosureRoute.test.ts`

**Interfaces:**
- Consumes: `supportTickets.closedAt`, `supportTickets.closedByUserId`.
- Produces: сериализованные `closedAt` и `closedBy`.

- [ ] Написать исходный тест: close route должен записывать `closedAt`, `closedByUserId: userId` и сериализовать закрывающего пользователя.
- [ ] Запустить тест и подтвердить FAIL из-за отсутствующих записей/полей.
- [ ] Обновить close route и выборки обращений, добавить данные в `serializeTicket`.
- [ ] Запустить тест и подтвердить PASS.

### Task 3: Закрытие TaskScreen и подпись в интерфейсе

**Files:**
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/support/supportSection.test.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Consumes: `SupportTicket.closedAt`, `SupportTicket.closedBy`.
- Produces: переход на `/support` только после успешного закрытия и компактную подпись закрытия.

- [ ] Добавить тесты на вызов `closeModal()` после успешного ответа и вывод локализованной подписи.
- [ ] Запустить тесты и подтвердить ожидаемый FAIL.
- [ ] Реализовать закрытие маршрута и подпись в карточках/истории.
- [ ] Поднять версию приложения и PWA-кэш, добавить release note.
- [ ] Запустить профильные тесты, затем `pnpm test`, `pnpm check`, `pnpm build` и `git diff --check`.
- [ ] Закоммитить, отправить `main`, дождаться deploy и проверить `/api/health`, версию и Service Worker на продакшене.
