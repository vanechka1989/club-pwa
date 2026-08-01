# Admin Attention Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passive analytics warning with two actionable drill-down controls and count payment problems uniquely.

**Architecture:** Reuse the existing access and payment drill-down task screens. Extend the payment breakdown domain with an `attention` union filter, expose a unique `problemOrders` metric from statistics, and wire compact mobile-first alert buttons to the existing navigation functions.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS, Playwright, PWA service worker.

## Global Constraints

- A failed payment or invalid webhook is a problem; an order matching both counts once.
- Access expiry always means the next seven days, independent of the selected analytics period.
- Payment problems respect the selected analytics period.
- Existing API contracts and payment data are unchanged.
- Controls must remain usable from 320 px and have at least a 44 px tap target.

---

### Task 1: Unique payment problem domain

**Files:**
- Modify: `apps/web/src/features/admin/adminPaymentDrilldown.ts`
- Modify: `apps/web/src/features/admin/adminPaymentDrilldown.test.ts`
- Modify: `apps/web/src/features/admin/adminStatistics.ts`
- Modify: `apps/web/src/features/admin/adminStatistics.test.ts`

**Interfaces:**
- Produces: `isPaymentProblemOrder(order: PaymentOrderLog): boolean`
- Produces: breakdown key `attention`
- Produces: `stats.payments.problemOrders: number`

- [ ] Add failing tests for union filtering, route resolution, and unique counting.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Add the shared predicate, `attention` breakdown key, union filter, and statistics metric.
- [ ] Run focused tests and confirm they pass.

### Task 2: Actionable attention interface

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`
- Modify: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

**Interfaces:**
- Consumes: `stats.payments.problemOrders`
- Consumes: existing `openUserAccessDrilldown` and `openPaymentDrilldown`
- Produces: `.admin-stat-attention` and `.admin-stat-attention-action`

- [ ] Add a failing contract test for two independent buttons, direct drill-down calls, accessible copy, and responsive styles.
- [ ] Run the focused navigation test and confirm it fails.
- [ ] Replace the passive paragraph with conditional buttons and add payment reason labels to the combined drill-down.
- [ ] Add mobile-first styling with responsive two-column enhancement.
- [ ] Run the focused navigation and domain tests and confirm they pass.

### Task 3: Release and verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: related release/PWA tests

- [ ] Add failing expectations for the next version and cache number.
- [ ] Update release metadata, history, notes, and service-worker cache.
- [ ] Run focused release tests.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:release`.
- [ ] Commit, push `main`, wait for CI/deploy, and verify health, readiness, cache version, release version, and new production bundle markers.

