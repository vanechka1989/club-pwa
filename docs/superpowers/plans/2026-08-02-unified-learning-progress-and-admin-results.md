# Unified Learning Progress And Admin Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Объединить клиентский прогресс с продолжением урока и предоставить администратору единую вкладку обучения с отдельным полным экраном результата теста или ДЗ.

**Architecture:** Лёгкие сводные данные продолжают загружаться вместе с карточкой клиента, а подробности выбранной попытки загружаются лениво через защищённый admin endpoint. Визуальные блоки выделяются из крупных контейнеров в самостоятельные Vue-компоненты; маршрутизация и мутации остаются в `AdminSection.vue` и `LearningSection.vue`.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest, Testing Library Vue, Playwright, CSS design tokens.

## Global Constraints

- Не менять существующую бизнес-логику завершения уроков, проверки и сброса.
- Полные ответы и временные ссылки доступны только авторизованному администратору с правом `materials`.
- Минимальная интерактивная область — 44 px; не допускать горизонтального переполнения от 320 до 1440 px.
- Выпускать только на `https://club2.myn8nservertest.ru`, сервер `2.27.28.89`, каталог `/opt/club-pwa`, согласно `AGENTS.md`.

---

### Task 1: Безопасный API полного результата

**Files:**
- Create: `apps/api/src/admin/assessmentResult.ts`
- Create: `apps/api/src/admin/assessmentResult.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Consumes: существующие `quizAttempts`, `quizAttemptQuestions`, `quizAnswers`, `homeworkSubmissions`, `homeworkAttachments`, `assessmentReviews`.
- Produces: `AdminAssessmentResult` и методы `getAdminQuizResult(clientId, recordId)`, `getAdminHomeworkResult(clientId, recordId)`.

- [ ] **Step 1: Write failing domain tests** for quiz option states, free-text points, homework review/reset metadata, and record/client ownership mismatch.
- [ ] **Step 2: Run** `pnpm --filter @club/api exec vitest run src/admin/assessmentResult.test.ts` and confirm the expected failures.
- [ ] **Step 3: Implement serializers** that return full quiz/homework details without exposing unrelated user data.
- [ ] **Step 4: Add protected routes** `/admin/users/:telegramId/learning/quiz/:recordId` and `/admin/users/:telegramId/learning/homework/:recordId`; require `materials`, resolve the selected user, and reject a record owned by another user with 404.
- [ ] **Step 5: Extend web API types and clients** with explicit discriminated quiz/homework result shapes.
- [ ] **Step 6: Run focused API tests** and the affected route/security tests.

### Task 2: Единый клиентский учебный виджет

**Files:**
- Create: `apps/web/src/features/learning/LearningProgressHero.vue`
- Create: `apps/web/src/features/learning/LearningModuleProgress.vue`
- Create: `apps/web/src/features/learning/learningProgressHero.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Modify: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Consumes: общий процент, completed/total, состояние, текущий/первый/последний урок и существующий обработчик открытия урока.
- Produces: единый hero с событием `open`, а также компактный progress-компонент модуля.

- [ ] **Step 1: Write failing component tests** for 0%, partial and 100% states, single primary action, accessible progress values and absence of duplicate standalone cards.
- [ ] **Step 2: Run focused web tests** and confirm failures describe the old split layout.
- [ ] **Step 3: Implement `LearningProgressHero.vue`** with progress ring, lesson thumbnail/copy and one action.
- [ ] **Step 4: Implement `LearningModuleProgress.vue`** with state, `X из Y`, one percent label and one track.
- [ ] **Step 5: Integrate both components** into `LearningSection.vue`, preserving search, favorites, collapse and lesson navigation.
- [ ] **Step 6: Add responsive/theme styles** using existing semantic tokens and reduced-motion-safe transitions.
- [ ] **Step 7: Run focused learning tests.**

### Task 3: Единая секция «Обучение» в карточке клиента

**Files:**
- Create: `apps/web/src/features/admin/AdminClientLearningSection.vue`
- Create: `apps/web/src/features/admin/adminClientLearningSection.test.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/adminClients.css`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.test.ts`
- Modify: `apps/web/src/features/admin/adminClientLearningEngagement.test.ts`

**Interfaces:**
- Consumes: `learningEngagement`, `learningAssessments`, duration/date formatters.
- Produces: event `open-result` with `{ mode, recordId }` and one accessible accordion with filters.

- [ ] **Step 1: Write failing tests** requiring one «Обучение» summary, filters, merged reverse-chronological list and result navigation events.
- [ ] **Step 2: Run focused admin tests** and confirm they fail while the old two accordions remain.
- [ ] **Step 3: Implement summary calculations and merged presentation records** without changing shared API payloads.
- [ ] **Step 4: Implement filter controls and lesson/assessment rows** with status-specific empty states.
- [ ] **Step 5: Replace the two old accordions** in `AdminClientsPanel.vue` and forward `open-learning-result`.
- [ ] **Step 6: Add compact responsive styles** and run focused tests.

### Task 4: Отдельный экран результата теста или ДЗ

**Files:**
- Create: `apps/web/src/features/admin/AdminAssessmentResultTask.vue`
- Create: `apps/web/src/features/admin/adminAssessmentResultTask.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/app/taskNavigation.ts`
- Modify: `apps/web/src/features/admin/adminClients.css`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`

**Interfaces:**
- Consumes: `AdminAssessmentResult`, reset API methods and client identity.
- Produces: route `/admin/clients/:telegramId/learning/:mode/:recordId`, back navigation and reset completion event.

- [ ] **Step 1: Write failing route/component tests** for quiz breakdown, homework text/attachments/history, loading/error/not-found and back navigation.
- [ ] **Step 2: Run focused tests** and confirm missing route/screen failures.
- [ ] **Step 3: Register the task route** and synchronize it in `AdminSection.vue`, selecting the client before loading the result.
- [ ] **Step 4: Implement quiz rendering** for all options, selected/correct states, per-question points and overall attempt summary.
- [ ] **Step 5: Implement homework rendering** for text, safe attachments, review and reset metadata.
- [ ] **Step 6: Wire reset actions** through existing confirmation flow, then reload result and client summary.
- [ ] **Step 7: Run focused component/navigation tests.**

### Task 5: Release, visual verification and production

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: completed client/admin UI and API.
- Produces: deployable release and production evidence.

- [ ] **Step 1: Extend Playwright scenarios** for the unified client hero and admin result route; observe failure before updating fixtures/implementation assertions.
- [ ] **Step 2: Bump release and service-worker cache** with concise release notes.
- [ ] **Step 3: Run focused tests, `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`.**
- [ ] **Step 4: Inspect 320, 390, 768, 1024 and 1440 px** for overflow, focus, contrast and safe-area behavior.
- [ ] **Step 5: Review diff, commit and push `main`.**
- [ ] **Step 6: Execute the mandatory `AGENTS.md` preflight**, deploy exact commit only to `/opt/club-pwa` on `2.27.28.89`, and verify `club2` health, readiness, version, service worker, server HEAD and deployed marker.
