# Learning Engagement Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accurate active-time analytics for learning cards with admin card and member drilldowns.

**Architecture:** The PWA records cumulative, idempotent engagement session snapshots only while a lesson is actively visible. The API persists member-owned sessions and aggregates them for a period; the admin learning dashboard consumes dedicated analytics endpoints.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle/PostgreSQL, Zod, Vitest, pnpm.

## Global Constraints

- Do not count hidden, unfocused, closed, or paused-video time.
- Do not collect pointer, keyboard, content, or screen data.
- Preserve existing progress/playback APIs and mobile layout.
- Cap one session at 86,400 seconds and make retries idempotent.

---

### Task 1: Persistence and aggregation contracts

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0060_learning_engagement_sessions.sql`
- Create: `apps/api/src/learning/engagement.ts`
- Test: `apps/api/src/learning/engagement.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces `normalizeEngagementSnapshot`, `summarizeLearningEngagement`, and shared response types.

- [ ] Write failing tests for cumulative counter normalization, quick exits, median time, and card summaries.
- [ ] Run the focused tests and confirm failure because the engagement module is missing.
- [ ] Add the table, migration, schemas, and minimal aggregation implementation.
- [ ] Run focused API/shared tests and confirm they pass.

### Task 2: Member ingestion API

**Files:**
- Modify: `apps/api/src/routes/learning.ts`
- Test: `apps/api/src/learning/engagementRoute.test.ts`

**Interfaces:**
- Consumes the cumulative snapshot schema and persists only the authenticated member's session.
- Produces `POST /learning/items/:id/engagement`.

- [ ] Write failing route/source tests for validation, item/material ownership, idempotent counters, and cross-user session rejection.
- [ ] Run the focused test and confirm expected failure.
- [ ] Implement the authenticated upsert endpoint with server-side ownership and caps.
- [ ] Run focused tests and confirm they pass.

### Task 3: Admin analytics API

**Files:**
- Create: `apps/api/src/admin/learningEngagement.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/admin/learningEngagement.test.ts`

**Interfaces:**
- Produces summary/card and per-user drilldown queries filtered by an inclusive date range.

- [ ] Write failing tests for date filtering, card aggregation, and user drilldowns.
- [ ] Run focused tests and confirm expected failure.
- [ ] Implement query builders and admin endpoints.
- [ ] Run focused tests and confirm they pass.

### Task 4: Active lesson tracker

**Files:**
- Create: `apps/web/src/features/learning/learningEngagement.ts`
- Test: `apps/web/src/features/learning/learningEngagement.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`

**Interfaces:**
- Produces `createLearningEngagementTracker` and API snapshot posting.

- [ ] Write failing fake-timer tests for visible/focused counting, hidden pause, video-only counting, flush, retry-safe cumulative values, and disposal.
- [ ] Run focused tests and confirm expected failure.
- [ ] Implement the tracker and connect it to lesson open/close and video play/pause events.
- [ ] Run focused tests and confirm they pass.

### Task 5: Admin learning dashboard

**Files:**
- Create: `apps/web/src/features/admin/AdminLearningEngagement.vue`
- Test: `apps/web/src/features/admin/adminLearningEngagement.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes the engagement summary and drilldown endpoints.
- Produces the responsive learning analytics dashboard and member drilldown.

- [ ] Write failing component/source tests for summary metrics, card rows, drilldown navigation, empty/loading/error states, and narrow layouts.
- [ ] Run focused tests and confirm expected failure.
- [ ] Implement the dashboard and responsive styles without nested card overflow.
- [ ] Run focused tests and confirm they pass.

### Task 6: Release and deployment verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

- [ ] Add the release-note test first and confirm it fails on the old version.
- [ ] Bump the version and add release notes.
- [ ] Run `pnpm check`, `pnpm test`, and `pnpm build` with zero failures.
- [ ] Verify mobile layouts through existing Playwright/PWA audit coverage.
- [ ] Commit, deploy through the repository deployment workflow, and smoke-test health plus engagement endpoints.
