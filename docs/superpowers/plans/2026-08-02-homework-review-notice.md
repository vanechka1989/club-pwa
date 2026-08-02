# Homework Review Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать последнее решение администратора по домашнему заданию и его комментарий в верхнем блоке экрана «Модули».

**Architecture:** `GET /learning` получает компактное поле `latestHomeworkReview`, сформированное из последней проверенной отправки пользователя. `LearningSection` сопоставляет уведомление с уже загруженным уроком и передаёт его в `LearningProgressHero`, который выводит отдельную кликабельную плашку, не заменяя обычное продолжение обучения.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Zod, Vue 3, Vitest, Testing Library, Playwright.

## Global Constraints

- Поддержать только состояния `needs_revision` и `accepted`.
- Комментарий отображать только при наличии непустого значения.
- Плашка целиком открывает соответствующий урок.
- Сохранить обычную карточку продолжения обучения.
- Не допускать горизонтального переполнения от длинного комментария на ширине 320 px.

---

### Task 1: Контракт и серверные данные

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/learningContent.test.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Create: `apps/api/src/learning/homeworkReviewNotice.test.ts`

**Interfaces:**
- Produces: `LearningProgressSummary.latestHomeworkReview: { contentItemId: string; status: "needs_revision" | "accepted"; reviewComment: string | null; reviewedAt: string } | null`.

- [ ] **Step 1: Write failing shared and API source-contract tests**

Assert that `learningHomeResponseSchema` parses `latestHomeworkReview` for both statuses and rejects another status. Assert that the learning route filters by the current user and published module content, orders by `reviewedAt` descending, and returns the associated review comment.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @club/shared test -- src/learningContent.test.ts && pnpm --filter @club/api test -- src/learning/homeworkReviewNotice.test.ts`

Expected: FAIL because `latestHomeworkReview` is absent from the schema and route.

- [ ] **Step 3: Implement the minimal contract and query**

Add the nullable object to `learningProgressSummarySchema`. In `GET /learning`, query the newest reviewed homework submission for the authenticated user inside `moduleContentWhere`, left join its review, and serialize `contentItemId`, narrowed status, comment, and ISO review time.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2 and expect all focused tests to pass.

### Task 2: Member-facing notice and navigation

**Files:**
- Modify: `apps/web/src/features/learning/LearningProgressHero.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Test: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Consumes: `LearningProgressSummary.latestHomeworkReview` from Task 1.
- Produces: `LearningProgressHero` props `reviewStatus`, `reviewLessonTitle`, `reviewComment` and event `openReview`.

- [ ] **Step 1: Write failing member tests**

Add one test for `needs_revision` asserting «Нужна доработка», the admin comment, «Исправить ДЗ», and opening the reviewed lesson. Add one test for `accepted` asserting «ДЗ принято», an optional comment, and preservation of the ordinary continuation card.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- src/features/learning/learningMemberContent.test.ts`

Expected: FAIL because the review notice is not rendered.

- [ ] **Step 3: Implement the minimal Vue behavior**

Resolve the reviewed lesson from `moduleCards`, pass its data to the hero, and emit a dedicated action that opens that lesson. Render the status button above the existing continuation button with semantic status tokens, a 44 px minimum target, wrapping text, and conditional comment.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2 and expect all tests to pass.

### Task 3: Responsive regression and release metadata

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `playwright.release.config.ts`
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: release `6.11` and service worker cache `club-pwa-v283`.

- [ ] **Step 1: Add failing E2E and release tests**

Mock a reviewed homework on the learning home response, assert the notice and comment are visible and clickable, and check no horizontal overflow. Update release expectations to `6.11` and `v283` before production metadata.

- [ ] **Step 2: Verify RED**

Run the focused Vitest files and the new Playwright scenario; expect release expectations and UI scenario to fail before implementation metadata is updated.

- [ ] **Step 3: Update metadata and release matrix**

Publish release notes describing visible homework decisions and comments, move `6.10` into history, bump the cache, and include the new E2E scenario in the release grep.

- [ ] **Step 4: Verify focused GREEN and screenshots**

Run the scenario at 320, 390, 768, 1024, desktop, release Android, and iPhone; inspect dark and light screenshots.

### Task 4: Full verification and deployment

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full validation**

Run: `pnpm test`, `pnpm check`, `pnpm build`, `pnpm test:e2e:release`, and `git diff --check`.

- [ ] **Step 2: Commit and push**

Commit production changes as `feat: show homework review status in learning hero` and push `main`.

- [ ] **Step 3: Deploy and verify production**

Wait for deployment, then verify commit SHA, healthy containers, `/`, `/api/health`, `/api/ready`, public release `6.11`, and service worker `v283`.
