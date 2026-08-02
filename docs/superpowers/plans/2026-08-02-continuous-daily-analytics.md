# Continuous Daily Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every daily analytics chart display a continuous calendar sequence and show zero for dates without activity.

**Architecture:** Add one UTC date-sequence utility to the shared package and use it when assembling club and acquisition timelines. Fixed and custom periods use their selected boundaries; all-time views use the first and last real event so they do not manufacture years of empty history.

**Tech Stack:** TypeScript, Vue 3, Vitest, pnpm workspace, Playwright, Docker deployment.

## Global Constraints

- Preserve existing totals, filtering rules, drilldowns, and chart interactions.
- Apply the rule to daily clients, payments, communication, and acquisition charts; hourly mailing charts are outside this daily-date change.
- Empty days must contain numeric zero values in every metric field.
- Publish as version `6.07` and service-worker cache `club-pwa-v279`.

---

### Task 1: Shared UTC date sequence

**Files:**
- Create: `packages/shared/src/dailyDateRange.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/dailyDateRange.test.ts`

**Interfaces:**
- Produces: `utcDateKeys(from: string, to: string): string[]`, returning inclusive `YYYY-MM-DD` keys.

- [ ] **Step 1: Write failing tests for inclusive dates, month boundaries, and reversed input.**
- [ ] **Step 2: Run `pnpm --filter @club/shared test -- dailyDateRange.test.ts` and confirm failure.**
- [ ] **Step 3: Implement `utcDateKeys` with UTC calendar arithmetic and export it.**
- [ ] **Step 4: Run the shared tests and confirm they pass.**

### Task 2: Club daily timelines

**Files:**
- Modify: `apps/web/src/features/admin/adminStatistics.ts`
- Test: `apps/web/src/features/admin/adminStatistics.test.ts`

**Interfaces:**
- Consumes: `utcDateKeys(from, to)`.
- Produces: zero-filled `clients.timeline`, `payments.timeline`, and `communication.timeline`.

- [ ] **Step 1: Add assertions that a custom period includes every day and zero values for missing clients, payments, and messages.**
- [ ] **Step 2: Run the focused web test and confirm the sparse timelines fail.**
- [ ] **Step 3: Add period-aware timeline bounds and fill each daily row with its metric-specific zero object.**
- [ ] **Step 4: Update existing timeline fixtures and run the focused test until green.**

### Task 3: Acquisition daily timeline

**Files:**
- Modify: `apps/api/src/acquisition/acquisitionAnalytics.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/AdminAcquisitionAnalytics.vue`
- Test: `apps/api/src/acquisition/acquisitionAnalytics.test.ts`

**Interfaces:**
- Consumes: `utcDateKeys(from, to)`.
- Produces: acquisition timeline rows with zero visits, registrations, paid users, and revenue for missing dates.

- [ ] **Step 1: Add an API test with activity on two non-adjacent dates and assert zero rows between them.**
- [ ] **Step 2: Run the focused API test and confirm failure.**
- [ ] **Step 3: Fill the requested API period; without explicit bounds, fill only between the first and last actual event.**
- [ ] **Step 4: Keep all-time acquisition unbounded in the request and use UTC calendar query boundaries for fixed/custom dates.**
- [ ] **Step 5: Run the focused API and web tests and confirm they pass.**

### Task 4: Release and verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: release `6.07` and cache `club-pwa-v279`.

- [ ] **Step 1: Write failing release assertions for `6.07` and `v279`.**
- [ ] **Step 2: Update release metadata, history, and service-worker cache.**
- [ ] **Step 3: Run `pnpm test`, `pnpm check`, `pnpm build`, and relevant Playwright suites.**
- [ ] **Step 4: Inspect the mobile analytics screens and ensure 0-height bars retain readable zero labels and horizontal scrolling.**
- [ ] **Step 5: Commit, push, verify the deployment workflow, and check production health/version.**
