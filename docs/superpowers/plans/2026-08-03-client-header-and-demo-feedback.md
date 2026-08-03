# Client Header And Demo Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate client identity into the task header and make demo analytics regeneration, product coverage, and retention breakdowns clear and realistic.

**Architecture:** Add optional heading slots through `UiPageHeader` and `TaskScreen`, then use them only in `AdminClientsPanel`. Keep the existing catalog-by-ID generator and harden its UI tests; add a short-lived reactive feedback state in `AdminSection` shared by both regeneration buttons.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library, Playwright, CSS.

## Global Constraints

- Preserve all access-control and deletion business logic.
- Do not expose email or phone in the task header; preserve the permission-aware contact card.
- Keep every interactive header control at least 44×44 px.
- Every configured product ID must remain a separate demo finance row.
- Product/provider retention groups must be exclusive and sum to the overall paying, active, and churned customer totals.
- Release as version 6.22 with the next service-worker cache.

---

### Task 1: Custom client task heading

**Files:**
- Modify: `apps/web/src/features/ui/UiPageHeader.vue`
- Modify: `apps/web/src/features/app/TaskScreen.vue`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`

**Interfaces:**
- Produces: optional `heading` slot propagated from `TaskScreen` to `UiPageHeader`.
- Preserves: existing `title`, `subtitle`, `actions`, and `back` contracts.

- [ ] Write a failing component test asserting one client identity in the custom header, no email in the header, and the preserved contact card.
- [ ] Run the focused test and confirm it fails on the duplicated current layout.
- [ ] Add the optional heading slot, replace only the duplicate client identity block, and keep the contact card unchanged.
- [ ] Add mobile-first header CSS and run the focused test to green.

### Task 2: Demo regeneration feedback and product-only rows

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/AdminFinanceAnalytics.vue`
- Modify: `apps/web/src/features/admin/showcaseAnalytics.ts`
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`
- Test: `apps/web/src/features/admin/AdminFinanceAnalytics.test.ts`
- Test: `apps/web/src/features/admin/showcaseAnalytics.test.ts`

**Interfaces:**
- Produces: `showcaseRegenerationConfirmed` transient state and `aria-live` confirmation.
- Preserves: `createShowcaseAnalytics(seed, range, catalog)` catalog rows keyed by product ID.

- [ ] Write failing tests for feedback text, no kind badges, duplicate-title products retaining distinct IDs, and coherent non-zero retention groups.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement one-second confirmation/animation, remove product kind badges, assign exclusive last-product/provider retention groups, and render compact breakdown cards.
- [ ] Run all focused admin tests to green.

### Task 3: Release and verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: related release/PWA tests
- Modify: `apps/web/public/sw.js`

- [ ] Write failing release assertions for version 6.22 and the next cache ID.
- [ ] Update release metadata and history, then run focused tests.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release`, and `git diff --check`.
- [ ] Commit, perform mandatory production preflight, push `main`, monitor the standard deployment, and verify public endpoints, release assets, service worker, containers, logs, and owner notification.
