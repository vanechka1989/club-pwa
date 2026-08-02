# Homework Review Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, per-result homework review inbox opened from a compact learning progress button.

**Architecture:** The learning home API returns every undismissed latest-version homework review and exposes an authenticated idempotent dismissal endpoint backed by a dedicated table. The progress hero opens a full-screen `TaskScreen` that owns list rendering, item dismissal, and lesson navigation.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest, Testing Library, Playwright.

## Global Constraints

- The launcher label is `Проверки ДЗ`; the task-screen title is `Результаты ДЗ`.
- Dismissal is persisted per user and per homework submission.
- A new submission version can produce a new notice.
- Every close control is at least 44×44 px and has an accessible name.
- Existing learning continuation behavior remains unchanged.
- The revision status label is `Домашнее задание не принято`; review text is introduced by `Комментарий модератора`.

---

### Task 1: Persistent dismissal contract

**Files:**
- Create: `apps/api/drizzle/0068_homework_review_dismissals.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/db/lessonAssessmentSchema.test.ts`
- Test: `packages/shared/src/learningContent.test.ts`

**Interfaces:**
- Produces: `homeworkReviewDismissals` and `LearningProgressSummary.homeworkReviewNotices[]` containing `submissionId`, `contentItemId`, `status`, `reviewComment`, `reviewedAt`.

- [ ] Write tests that require the new schema table and two literal notice objects.
- [ ] Run the focused tests and confirm they fail because the contract does not exist.
- [ ] Add the migration, Drizzle table, indexes, foreign keys, and shared response schema.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit the contract and migration.

### Task 2: Undismissed review API

**Files:**
- Modify: `apps/api/src/learning/homeworkReviewNotice.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Test: `apps/api/src/learning/homeworkReviewNotice.test.ts`
- Test: `apps/api/src/routes/learningHomeworkReviewDismissal.test.ts`

**Interfaces:**
- Consumes: `homeworkReviewDismissals`.
- Produces: `serializeHomeworkReviewNotice(row)` including `submissionId`; `POST /learning/homework-reviews/:submissionId/dismiss` returning `{ ok: true }` or 404.

- [ ] Write tests for multiple serialized notices and an idempotent owner-only dismissal.
- [ ] Run focused API tests and confirm expected failures.
- [ ] Query all newest-version, reviewed, undismissed submissions ordered newest first.
- [ ] Add the owner-scoped dismissal endpoint with an upsert/no-op conflict policy.
- [ ] Run API tests and typecheck.
- [ ] Commit the API behavior.

### Task 3: Review results task-screen

**Files:**
- Create: `apps/web/src/features/learning/HomeworkReviewResultsTask.vue`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/learning/LearningProgressHero.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Test: `apps/web/src/features/learning/homeworkReviewResultsTask.test.ts`
- Test: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Consumes: `homeworkReviewNotices[]` and `dismissHomeworkReviewNotice(submissionId)`.
- Produces: `open`, `dismiss`, and `open-lesson` behaviors visible to the member.

- [ ] Write component tests for a launcher badge, two records, independent close, rollback on failure, empty state, and lesson opening.
- [ ] Run focused web tests and confirm failures caused by the missing UI.
- [ ] Implement the compact launcher and full-screen result list using `TaskScreen`.
- [ ] Implement optimistic individual dismissal with rollback and global error notification.
- [ ] Add semantic status styling, 44 px controls, focus states, wrapping, and responsive layout.
- [ ] Run focused web tests and typecheck.
- [ ] Commit the member UI.

### Task 4: Release and production verification

**Files:**
- Modify: release/version files discovered by the existing release tests.
- Modify: `tests/e2e/app.spec.ts` or the existing learning release scenario.

**Interfaces:**
- Produces: a cache-busted PWA release with the inbox covered by device tests.

- [ ] Add an end-to-end fixture with two review results and assert opening, closing one, and keeping the other.
- [ ] Run it red before updating implementation fixtures/release metadata.
- [ ] Update release metadata and service-worker cache version.
- [ ] Run focused tests, full `pnpm test`, `pnpm check`, `pnpm build`, and release/device Playwright suites.
- [ ] Inspect screenshots at 320, 390, 768, 1024, and 1440 px in supported light/dark themes.
- [ ] Commit, push `main`, deploy the exact full commit SHA, and verify health endpoints, containers, logs, and CI.
