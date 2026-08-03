# Compact Admin Headers And Retention Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the mobile height of client and finance headers and present retention breakdowns as compact, comparable charts.

**Architecture:** Preserve the existing analytics data contracts and TaskScreen structure. Restrict changes to client header styling, finance action layout, retention markup/CSS, regression tests, and release metadata.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve owner-only deletion and its confirmation workflow.
- Preserve permission-aware client contact data.
- Keep every interactive target at least 44×44 px.
- Keep duplicate product names as separate rows by unique product ID.
- Do not add a chart dependency; render accessible charts with semantic HTML and CSS.
- Release as version 6.23 with service worker cache v295.

---

### Task 1: Compact client header

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Test: `apps/web/src/features/admin/adminClientDeletion.test.ts`
- Test: `apps/web/src/features/admin/adminCompactLayout.test.ts`

**Interfaces:**
- Consumes: the existing `heading` and `actions` slots of `TaskScreen`.
- Preserves: `request-client-delete`, `canDeleteSelectedUser`, and all client data props.

- [ ] Add failing source/style assertions for a 40 px avatar, 44 px controls, compact status pills, and reduced delete-button shadow/icon.
- [ ] Run the two focused test files and confirm the new assertions fail because the current avatar is 48 px and the delete treatment is oversized.
- [ ] Update scoped client header CSS and mobile overrides without changing deletion behavior or contact markup.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Equal finance header actions

**Files:**
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

**Interfaces:**
- Consumes: `.admin-stat-task-demo`, `.admin-stat-task-regenerate`, and `.ui-page-header__actions`.
- Preserves: regeneration events and confirmation labels.

- [ ] Add a failing CSS contract asserting one shared two-row action grid and equal 44 px control heights.
- [ ] Run the focused navigation test and confirm it fails on the current unequal styles.
- [ ] Add the shared action sizing, stable widths, pressed state, and 320 px responsive rules.
- [ ] Run the focused test and confirm it passes.

### Task 3: Retention charts

**Files:**
- Modify: `apps/web/src/features/admin/AdminFinanceAnalytics.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`
- Test: `apps/web/src/features/admin/AdminFinanceAnalytics.test.ts`

**Interfaces:**
- Consumes: the existing `retention.onePurchaseChurned`, `repeatPurchaseChurned`, `exitStages`, `byProducts`, and `byProviders` values.
- Produces: accessible `.admin-finance-churn-composition` and `.admin-finance-breakdown-chart` structures.

- [ ] Add failing component assertions for one composed churn graphic, two chart groups, accessible labels, and unboxed chart rows.
- [ ] Run the focused finance test and confirm the structures are absent.
- [ ] Replace the two summary cards with a composed horizontal bar and legend while preserving exact counts and percentages.
- [ ] Replace product/provider card grids with compact chart rows and shared percentage scale; keep rows keyed by `row.key`.
- [ ] Add mobile-first CSS, overflow protection, theme-safe colors, and reduced-motion behavior.
- [ ] Run the focused finance tests and confirm they pass.

### Task 4: Mobile release regression

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `playwright.release.config.ts` only if the new scenario is not already selected

**Interfaces:**
- Verifies: client heading, delete target, equal finance actions, chart semantics, regeneration feedback, and horizontal overflow.

- [ ] Extend the existing release scenarios with computed-size assertions for both finance actions and screenshots at 390 px.
- [ ] Add assertions for the churn composition and product/provider chart rows, including a non-zero generated data set.
- [ ] Run the targeted Android project and confirm the new screenshots and overflow checks pass.
- [ ] Run all release E2E projects.

### Task 5: Release 6.23 and production verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: related release tests
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: release metadata `6.23` and cache identifier `club-pwa-v295`.

- [ ] Add failing release assertions for version 6.23, its history entry, and v295.
- [ ] Update release metadata, notes, history, and service worker cache, then run focused tests.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release`, and `git diff --check`.
- [ ] Commit implementation and perform the mandatory domain/server/repository preflight.
- [ ] Push `main`, monitor `Deploy to VPS`, then verify public version, SW, API health, server commit, containers, critical logs, and `{"created":true,"reason":"created"}` notification.
