# Member Assessment Flow and Admin Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated member assessment screen with concrete results, per-client homework reset, and assessment visibility in admin analytics and client details.

**Architecture:** Reuse the existing lesson task route and assessment player, but split lesson entry and assessment-page responsibilities into focused Vue components. Extend the existing assessment tables and admin aggregation endpoints rather than creating a parallel subsystem.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle/PostgreSQL, Vitest, Testing Library, Playwright.

## Global Constraints

- Member quiz/homework entry must leave the lesson body and open `/learning/lessons/:lessonId/assessment`.
- Administrators keep assessment configuration on the same route, selected by permissions.
- Homework reset preserves submission/review history and clears only lesson completion.
- Every reset creates one notification and one administrator audit entry.
- Mobile controls remain at least 44×44 px with no horizontal overflow from 320 px upward.

---

### Task 1: Reset metadata and shared contracts

**Files:**
- Create: `apps/api/drizzle/0066_homework_submission_resets.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/db/lessonAssessmentSchema.test.ts`
- Test: `packages/shared/src/learningContent.test.ts`

**Interfaces:**
- Produces nullable `resetAt`, `resetByUserId`, `resetReason` persistence fields.
- Produces shared `learningAssessments` client-detail records and `assessments` analytics summary.

- [ ] Write schema/contract tests that fail because reset metadata and response fields do not exist.
- [ ] Run the focused shared/API tests and confirm the expected failures.
- [ ] Add migration, Drizzle columns, response schemas, and inferred types with compatibility defaults.
- [ ] Re-run focused tests and commit the green change.

### Task 2: Dedicated member assessment route and concrete results

**Files:**
- Create: `apps/web/src/features/learning/LessonAssessmentEntryCard.vue`
- Create: `apps/web/src/features/learning/LessonAssessmentTaskPage.vue`
- Modify: `apps/web/src/features/learning/LessonAssessmentPlayer.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/features/learning/lessonAssessmentPlayer.test.ts`
- Test: `apps/web/src/features/learning/learningTaskScreens.test.ts`

**Interfaces:**
- Consumes `LessonAssessmentStatus` with attempt/submission result metadata.
- Produces member navigation to `/learning/lessons/:lessonId/assessment` and completion event back to the lesson flow.

- [ ] Write failing component/source tests for mode-specific entry copy, member route restoration, absence of inline assessment inputs, and detailed result fields.
- [ ] Run focused web tests and confirm they fail for missing separate member flow.
- [ ] Add assessment-page mode, entry card, task page, route/back handling, and detailed player result UI.
- [ ] Re-run focused web tests and commit the green change.

### Task 3: Safe administrator homework reset

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/api/src/routes/lessonAssessmentRoutes.test.ts`

**Interfaces:**
- Produces `POST /admin/learning/assessments/homework/:id/reset` with `{ reason: string | null }` and `{ ok: true }`.

- [ ] Write failing route tests for accepted-only reset, completion clearing, notification/audit creation, and duplicate-reset rejection.
- [ ] Run the focused API route tests and confirm expected failures.
- [ ] Implement the transactional endpoint using the authenticated administrator and server-derived target IDs.
- [ ] Re-run focused API tests and commit the green change.

### Task 4: Assessment history and reset in the client card

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/features/admin/adminClientLearningEngagement.test.ts`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`

**Interfaces:**
- Consumes `AdminUserDetailResponse.learningAssessments` and `resetHomeworkSubmission(id, reason)`.
- Produces `reset-homework` panel event and refreshed client detail.

- [ ] Write failing aggregation/UI tests for assessment history, result copy, confirmation, and reset availability only on accepted homework.
- [ ] Run focused API/web tests and confirm expected failures.
- [ ] Aggregate attempts/submissions in user detail and render the new client-card accordion and reset flow.
- [ ] Re-run focused tests and commit the green change.

### Task 5: Assessment counters in learning analytics

**Files:**
- Modify: `apps/api/src/admin/learningEngagement.ts`
- Modify: `apps/web/src/features/admin/AdminLearningEngagement.vue`
- Modify: `apps/web/src/features/admin/adminLearningEngagement.css`
- Test: `apps/api/src/admin/learningEngagement.test.ts`
- Test: `apps/web/src/features/admin/adminLearningEngagement.test.ts`

**Interfaces:**
- Produces `LearningEngagementResponse.assessments` for the requested date range.

- [ ] Write failing tests for homework/test counters and the dedicated assessment KPI section.
- [ ] Run focused API/web tests and confirm expected failures.
- [ ] Add date-bounded aggregation queries and responsive KPI rendering.
- [ ] Re-run focused tests and commit the green change.

### Task 6: Release, visual verification, and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `tests/e2e/app.spec.ts`

- [ ] Add failing release/PWA/E2E assertions for the new version and assessment flows.
- [ ] Implement release metadata and service-worker cache bump.
- [ ] Run focused tests, full `pnpm test`, `pnpm check`, and `pnpm build`.
- [ ] Capture and inspect mobile screenshots; run the release Playwright suite.
- [ ] Review the diff, commit, push `main`, wait for `Deploy to VPS`, and verify production health, readiness, version, and service-worker cache.
