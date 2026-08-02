# Admin Client Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить все сводные строки карточки клиента в отдельные страницы и дать администратору сбрасывать завершённые тесты и принятые домашние задания.

**Architecture:** `AdminClientsPanel` оставляет только компактные кнопки. Новый `AdminClientDetailTask` отображает каркас `TaskScreen`, а `AdminClientDetailContent` — содержимое выбранного раздела и его действия. `AdminSection` хранит выбранный раздел, синхронизирует маршруты и локальный режим поддержки. Сброс теста расширяется на `passed` и атомарно снимает завершение урока.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Hono, Drizzle ORM, Vitest, Testing Library, Playwright, pnpm.

## Global Constraints

- Отдельные страницы: activity, learning, subscriptions, payments, referrals, moderation, devices, login-ips.
- Минимальная активная область кнопки: 44 px.
- В `clientCardOnly` URL поддержки не изменяется.
- Сброс доступен только для `passed`/`failed` теста и `accepted` ДЗ без предыдущего сброса.
- Production target: `club2.myn8nservertest.ru`, `2.27.28.89`, `/opt/club-pwa`.

---

### Task 1: Унифицированные кнопки и представления разделов

**Files:**
- Create: `apps/web/src/features/admin/AdminClientDetailContent.vue`
- Create: `apps/web/src/features/admin/AdminClientDetailTask.vue`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`
- Test: `apps/web/src/features/admin/adminClientDetailTask.test.ts`

**Interfaces:**
- Produces: `AdminClientDetailSection = "activity" | "learning" | "subscriptions" | "payments" | "referrals" | "moderation" | "devices" | "login-ips"`.
- Produces: panel event `open-client-section(section)` and task events `back`, `open-learning-result`, `revoke-mute`, `copy-device-info`.

- [ ] **Step 1: Write failing component tests** asserting eight accessible buttons, no expandable `<details>`, correct titles, empty states, and preserved actions.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- AdminClientsPanel.test.ts adminClientDetailTask.test.ts` and confirm failures are caused by missing section task components.
- [ ] **Step 3: Implement** compact buttons and focused detail components using the existing data props and formatting callbacks.
- [ ] **Step 4: Run the focused tests** and confirm they pass.
- [ ] **Step 5: Commit** with `feat: add dedicated client detail pages`.

### Task 2: Маршрутизация и безопасный возврат

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/app/taskNavigation.ts`
- Test: `apps/web/src/features/app/taskNavigation.test.ts`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `AdminClientDetailSection`.
- Produces: route `/admin/clients/:customerId/:section` and nested learning result route.

- [ ] **Step 1: Write failing navigation tests** for every section, direct deep link, UI Back, system Back, and `clientCardOnly` without router calls.
- [ ] **Step 2: Run focused unit and Playwright tests** and confirm missing routes fail.
- [ ] **Step 3: Implement** selected-section state, route parsing, push/back/fallback behavior, and reset state when the client closes.
- [ ] **Step 4: Run tests** on desktop, 320, 390, and 768 viewports.
- [ ] **Step 5: Commit** with `feat: route every client detail section`.

### Task 3: Полноценный сброс результата

**Files:**
- Modify: `apps/web/src/features/admin/AdminAssessmentResultTask.vue`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/web/src/features/admin/adminAssessmentResultTask.test.ts`
- Test: `apps/api/src/routes/learningAssessmentReset.test.ts`
- Test: `apps/api/src/admin/assessmentResult.test.ts`

**Interfaces:**
- Consumes: `resetQuizAttempts(attemptId)` and `resetHomeworkSubmission(submissionId)`.
- Produces: button label `Сбросить результат`; quiz reset accepts `passed | failed`, creates reset/audit/notification and clears `userContentProgress.completedAt`.

- [ ] **Step 1: Write failing UI tests** for passed, failed, pending, accepted, needs-revision, and already-reset results.
- [ ] **Step 2: Write failing API tests** for passed-test reset and atomic progress clearing while preserving audit and notification behavior.
- [ ] **Step 3: Run focused tests** and confirm current `failed`-only guard and old button copy cause the expected failures.
- [ ] **Step 4: Implement** the broadened reset transaction and visible button copy without weakening permissions.
- [ ] **Step 5: Run focused tests** and confirm all result states pass.
- [ ] **Step 6: Commit** with `feat: allow admins to reset completed assessments`.

### Task 4: Release, visual audit, and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`
- Test: `apps/web/src/features/app/pwa.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces: next application version and service-worker cache id.

- [ ] **Step 1: Write failing release tests** for the new version and notes.
- [ ] **Step 2: Update release metadata** and service-worker cache.
- [ ] **Step 3: Run** `pnpm test`, `pnpm check`, `pnpm build`, and responsive Playwright flows.
- [ ] **Step 4: Capture and inspect screenshots** at 320, 390, 768, 1024, and desktop widths; fix overflow or inconsistent states before proceeding.
- [ ] **Step 5: Request code review** and resolve all Critical/Important findings.
- [ ] **Step 6: Merge and push `main`**, wait for the single GitHub deployment workflow, and do not start a competing manual deployment.
- [ ] **Step 7: Verify production** health, readiness, exact commit, public version/cache, and release notification on `/opt/club-pwa` at `2.27.28.89`.
