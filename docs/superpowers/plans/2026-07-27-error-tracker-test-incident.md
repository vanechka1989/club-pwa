# Error Tracker Test Incident Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить компактные переключатели уведомлений и owner-only создание одного тестового инцидента через обычный pipeline трекера.

**Architecture:** API предоставляет узкий административный endpoint, который передаёт безопасное критическое событие в существующий `recordTrackedError`. Web-клиент вызывает endpoint и открывает возвращённую группу; стили checkbox изолированы внутри `AdminErrorTracker.vue`.

**Tech Stack:** TypeScript, Hono, Vue 3, Vitest, Testing Library, PostgreSQL.

## Global Constraints

- Только владелец может создавать тестовый инцидент.
- Тестовый инцидент должен использовать реальные настроенные push/email каналы.
- Checkbox имеет визуальный размер 20×20 px и область нажатия не менее 44 px.
- Никаких платёжных операций.

---

### Task 1: Test incident API

**Files:**
- Modify: `apps/api/src/errorTracker/service.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/errorTracker/testIncident.test.ts`

**Interfaces:**
- Produces: `createErrorTrackerTestIncident(identity: ErrorIdentity)` returning the recorded group.
- Produces: `POST /admin/error-tracker/test` returning `{ ok: true, groupId: string }`.

- [ ] Write a failing service test asserting the literal title, critical severity, admin route, and owner identity.
- [ ] Run `pnpm --filter @club/api test -- src/errorTracker/testIncident.test.ts` and confirm failure because the helper is absent.
- [ ] Implement the helper and owner-only route through existing `recordTrackedError`.
- [ ] Run the focused API test and confirm it passes.

### Task 2: Web interaction and compact controls

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminErrorTracker.vue`
- Modify: `apps/web/src/features/admin/adminErrorTracker.test.ts`

**Interfaces:**
- Consumes: `POST /admin/error-tracker/test`.
- Produces: `createAdminErrorTrackerTestIncident(): Promise<{ ok: true; groupId: string }>`.

- [ ] Add a failing component test that clicks `Создать тестовую ошибку`, observes the returned group open, and verifies both checkbox controls expose a compact class.
- [ ] Run the focused web test and confirm the expected failure.
- [ ] Add the client call, UI action, loading state, refresh/open flow, and 20×20 checkbox styling inside a 44 px label.
- [ ] Run the focused web test and confirm it passes.

### Task 3: Verification and production demonstration

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/releaseHistory.ts`

- [ ] Publish the next patch release and service-worker cache identifier.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, and device/browser visual checks at 320 px and 390 px.
- [ ] Commit, push `main`, and deploy the exact commit with `deploy/update.sh`.
- [ ] Verify health/readiness, deployed release/cache, containers, and API logs.
- [ ] While authenticated as owner, invoke the new UI action exactly once and verify the test group and notification delivery records.
