# Showcase Catalog Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the club's configured products and payment providers throughout showcase analytics and expose regeneration directly in analytics task headers.

**Architecture:** Pass the already-loaded safe payment catalog from `AdminSection` into the deterministic showcase generator. Derive all finance and order rows from the normalized catalog, while retaining fallbacks for empty projects. Reuse the existing seed regeneration action in task headers.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, pnpm workspace.

## Global Constraints

- Showcase mode must never write generated data to the API or database.
- Real catalog labels and kinds are preserved; only generated metrics change.
- Demo task-header controls must remain usable at 320 px width with 44 px touch targets.
- Production release target is `club2.myn8nservertest.ru`, `2.27.28.89`, `/opt/club-pwa`.

---

### Task 1: Catalog-aware generator

**Files:**
- Modify: `apps/web/src/features/admin/showcaseAnalytics.test.ts`
- Modify: `apps/web/src/features/admin/showcaseAnalytics.ts`

**Interfaces:**
- Consumes: `AdminStatsResponse["paymentProductOptions"]` and `AdminStatsResponse["paymentProviderOptions"]`.
- Produces: `createShowcaseAnalytics(seed, range, catalog)`.

- [ ] Add a test with multiple named products and providers; assert every configured entry appears and orders reference only configured entries.
- [ ] Run the focused Vitest file and confirm the new assertions fail because the catalog parameter is not supported.
- [ ] Normalize supplied catalog with safe defaults for empty arrays.
- [ ] Generate product/provider order allocations and derive matching finance totals and retention rows.
- [ ] Run the focused tests and confirm deterministic totals and catalog assertions pass.

### Task 2: In-screen regeneration control

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Modify: `apps/web/src/features/admin/showcaseAnalytics.test.ts` or a focused source guard test.

**Interfaces:**
- Consumes: existing `regenerateShowcaseAnalytics()` action.
- Produces: demo-only task-header button named `Сгенерировать`.

- [ ] Add a failing guard assertion for catalog propagation and conditional task-header regeneration.
- [ ] Pass live catalog options to the computed showcase snapshot.
- [ ] In demo mode render the regeneration button instead of `statisticsPeriodShortLabel`; retain the period in real mode.
- [ ] Style the button as a compact 44 px touch target and run focused tests.

### Task 3: Release and verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: matching release tests.

- [ ] Add failing release assertions for version `6.21`, release copy and the next service-worker cache.
- [ ] Update release metadata/history and make focused release tests pass.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release`, and `git diff --check`.
- [ ] Commit and push the exact tested revision, run the mandatory production preflight, and let the normal deployment workflow publish it.
- [ ] Verify health, readiness, version, service worker, server HEAD, deployed marker, feature assets and release notification.
