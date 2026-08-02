# Learning Engagement Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the admin learning analytics into a clear overview, assessment summary, and visual material list.

**Architecture:** Keep `AdminLearningEngagement.vue` as the data and interaction boundary. Change only its presentation markup and focused stylesheet, with Playwright covering the user-visible responsive contract.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright.

## Global Constraints

- Do not change API calls, date filters, calculations, or drill-down behavior.
- Support widths 320, 390, 768, 1024, and 1440 px without horizontal overflow.
- Reuse existing theme variables and retain minimum 44 px interactive targets.

---

### Task 1: Responsive learning dashboard contract

**Files:**
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: the `/admin` learning analytics route and existing API fixture.
- Produces: a regression contract for `.admin-learning-dashboard`, its summary, materials, and quick-exit bars.

- [ ] **Step 1: Write the failing browser assertions**

Open learning analytics through the progress metric and assert the new dashboard selectors, equal card widths, nonzero bounded bar widths, and `expectResponsiveLayoutIntegrity`.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm exec playwright test -c playwright.release.config.ts tests/e2e/app.spec.ts --project=release-android --grep "renders visual admin analytics overview"`

Expected: FAIL because `.admin-learning-dashboard` does not exist.

### Task 2: Reorganize the learning presentation

**Files:**
- Modify: `apps/web/src/features/admin/AdminLearningEngagement.vue`
- Modify: `apps/web/src/features/admin/adminLearningEngagement.css`
- Modify: `apps/web/src/features/admin/adminLearningEngagement.test.ts`

**Interfaces:**
- Consumes: `LearningEngagementResponse` without changing its shape.
- Produces: overview, assessment, materials heading, uniform cards, and proportional quick-exit indicators.

- [ ] **Step 1: Add minimal presentation markup**

Wrap the four KPIs in one labelled overview card, add a materials heading/count, render quick-exit tracks with `width: dashboard percentage`, and turn footer values into pills.

- [ ] **Step 2: Apply mobile-first styling**

Use an 8 px spacing rhythm, consistent surfaces and borders, two-column phone grids, four-column tablet overview, and two-column desktop material cards.

- [ ] **Step 3: Run focused tests until green**

Run the Vitest file and the targeted Android Playwright test. Expected: PASS.

### Task 3: Release and production verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: the next visible app version and cache identifier.

- [ ] **Step 1: Update release metadata and tests**

Move 6.05 into history, publish 6.06 with the learning analytics changes, and increment the service-worker cache to v278.

- [ ] **Step 2: Run complete verification**

Run: `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`. Expected: all applicable tests pass.

- [ ] **Step 3: Commit, push, deploy, and verify production**

Confirm the exact commit on local, origin, and server; verify `/health`, `/api/health`, `/api/ready`, v278, new UI markers, and healthy containers.
