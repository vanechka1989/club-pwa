# Admin Finance Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product/provider client filters, context-preserving finance drilldowns, and accurate server-aggregated analytics for payment systems, products, and subscription churn.

**Architecture:** Extend shared admin contracts with client payment facets and a dedicated finance analytics response. Build a pure API aggregation service over payment orders and recurrent subscriptions, expose it through an admin analytics route, and render the response in the existing finance TaskScreen. Keep client-side filtering pure and navigation state explicit.

**Tech Stack:** TypeScript, Bun/Hono, Drizzle/PostgreSQL, Vue 3, Vitest/Testing Library, Playwright.

## Global Constraints

- Analytics must use all matching database records, not the 100-order UI history limit.
- Client product/provider matches use successful payments only.
- Retention is lifetime: paid clients are split by whether access is active now.
- Existing period controls remain authoritative.
- Keep current visual tokens and minimum 44×44 px controls.
- No horizontal overflow at 320, 390, 768, 1024, or 1440 px.

---

### Task 1: Shared payment facet and finance analytics contracts

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/adminFinanceAnalytics.test.ts`

**Interfaces:**
- Produces `AdminStatsUser.paymentProductIds`, `AdminStatsUser.paymentProviders`, catalog option types, and `AdminFinanceAnalyticsResponse`.

- [ ] Write schema tests parsing two client facets and complete provider/product/churn fixtures, including empty arrays.
- [ ] Run `pnpm --filter @club/shared test -- adminFinanceAnalytics.test.ts` and confirm failure because fields/schemas are absent.
- [ ] Add the minimal Zod fields and schemas with backward-compatible defaults.
- [ ] Re-run the focused shared test and commit.

### Task 2: Client payment facets in admin stats API

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/admin/clientPaymentFacets.ts`
- Test: `apps/api/src/admin/clientPaymentFacets.test.ts`

**Interfaces:**
- Produces `buildClientPaymentFacetMaps(rows)` returning product/provider sets per user.
- Consumes successful order rows with `userId`, nullable `productId`, and provider code.

- [ ] Write a failing pure test proving failed/pending orders are excluded, duplicate paid orders collapse, and different users remain isolated.
- [ ] Run the focused API test and observe the missing module failure.
- [ ] Implement the pure mapper, query paid orders for the users returned by `/admin/stats`, and attach facets to `buildStatsUser`.
- [ ] Return active product and configured provider options from `/admin/stats`; run API/shared tests and commit.

### Task 3: Server-side finance aggregation

**Files:**
- Create: `apps/api/src/admin/financeAnalytics.ts`
- Test: `apps/api/src/admin/financeAnalytics.test.ts`
- Modify: `apps/api/src/routes/admin.ts`

**Interfaces:**
- Produces `buildAdminFinanceAnalytics({ orders, memberships, from, to, now })` and `GET /admin/analytics/finance?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- The endpoint returns period overview/provider/product rows plus lifetime retention, renewal-exit stages, last-product/provider churn rows, and a zero-data response.

- [ ] Write failing table-driven tests with literal expected totals for provider usage, product ranking, failed attempts, unique lifetime buyers, currently active buyers, one-purchase churn, repeat-purchase churn, and exit after renewal 1/2/3/4+.
- [ ] Run the focused tests and verify the missing aggregator failure.
- [ ] Implement period filtering, ruble normalization, grouping, stable sorting, latest-payment attribution, active-access detection, and renewal-stage matching.
- [ ] Add route validation for absent or paired `from`/`to`, query all relevant orders/current memberships with relations, serialize through the shared schema, run tests, and commit.

### Task 4: Dynamic client filters

**Files:**
- Modify: `apps/web/src/features/admin/adminClientAcquisitionFilters.ts`
- Test: `apps/web/src/features/admin/adminClientAcquisitionFilters.test.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`

**Interfaces:**
- Extends `AdminClientFilters` with `paymentProvider` and `paymentProductId`.
- `AdminClientsPanel` consumes dynamic options supplied by `AdminSection`.

- [ ] Add failing filter tests for product-only, provider-only, combined matches, empty product results, and reset defaults.
- [ ] Add failing component tests asserting labelled «Платёжная система» and «Продукт» selects render dynamic options and emit patches.
- [ ] Implement pure matching, refs/computed options, prop wiring, reset/filter-active behavior, and accessible select labels.
- [ ] Run focused web tests and commit.

### Task 5: Finance navigation restoration

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Test: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

**Interfaces:**
- `closePaymentDrilldown()` restores `activeStatisticsDetail = "finance"` and closes only the nested task route.

- [ ] Add a failing navigation test that opens finance, opens «Разовые», triggers back, and expects finance detail to remain visible.
- [ ] Run it and verify the current root-analytics behavior fails.
- [ ] Preserve the parent finance state while opening/closing payment drilldowns and synchronize direct routes safely.
- [ ] Run the focused test and commit.

### Task 6: Finance analytics UI

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/admin/AdminFinanceAnalytics.vue`
- Test: `apps/web/src/features/admin/AdminFinanceAnalytics.test.ts`
- Modify: `apps/web/src/features/admin/AdminStatisticsDetail.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles/admin.css` (or the existing admin style module resolved during implementation)

**Interfaces:**
- `getAdminFinanceAnalytics(range?)` returns `AdminFinanceAnalyticsResponse`.
- `AdminFinanceAnalytics` accepts `data`, `loading`, and `error`, and emits `retry`.

- [ ] Add failing component tests for provider rows, product rows, lifetime retention percentages, one-purchase/repeat-purchase churn, renewal exit stages, no-data state, loading, and retry.
- [ ] Implement API loading on finance open/period change with stale-request protection.
- [ ] Build mobile-first sections with semantic progress bars, readable values, empty/error states, and existing tokens.
- [ ] Integrate below the existing finance timeline, run focused tests, and commit.

### Task 7: Release regression, visual audit, and deployment

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: release metadata files located by `rg "currentRelease|club-pwa-v" apps/web/src public`

**Interfaces:**
- Release scenario covers two new filters and finance → one-time payments → back → finance.

- [ ] Add the release E2E scenario and update version/cache metadata.
- [ ] Run focused shared/API/web tests, then `pnpm check`, `pnpm test`, and `pnpm build`.
- [ ] Run Playwright at 320×720, 390×844, 768×1024, 1024×768, and 1440×900; inspect screenshots and correct overflow/overlap.
- [ ] Run `pnpm test:e2e:release`, verify a clean worktree diff, push `main`, deploy the exact commit, and confirm production health/API/cache/content.
