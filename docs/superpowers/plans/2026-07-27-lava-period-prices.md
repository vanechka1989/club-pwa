# Lava Period Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lava catalog synchronization store prices by currency and billing period, then autofill a compact currency selector with the correct period prices.

**Architecture:** Normalize Lava catalog prices at the API boundary, persist them under a currency-plus-period unique key, and expose a pure web helper that selects the price set for a tariff kind and access duration. The form component consumes that helper and reconciles refreshed fixed prices while preserving the administrator's enabled currency choices.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, Vue 3, Vitest, Testing Library.

## Global Constraints

- Do not silently change already published tariff bindings during catalog synchronization.
- Fixed Lava prices are read-only and become effective only when the tariff is saved.
- Support RUB, USD and EUR at 320 px and wider without horizontal overflow.
- Do not perform a real payment.

---

### Task 1: Persist prices by currency and billing period

**Files:**
- Create: `apps/api/drizzle/0059_lava_catalog_price_periodicity.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/payments/paymentSchemaMigration.test.ts`
- Modify: `apps/api/src/payments/multicurrencyModel.test.ts`

**Interfaces:**
- Produces: unique catalog price identity `(catalogItemId, currency, periodicity)` for the sync route.

- [ ] **Step 1: Write failing schema and migration tests** asserting the index includes `periodicity` and the migration replaces the old two-column index.
- [ ] **Step 2: Run** `pnpm --filter @club/api test -- src/payments/paymentSchemaMigration.test.ts src/payments/multicurrencyModel.test.ts` and confirm the new assertions fail against the two-column index.
- [ ] **Step 3: Add migration 0059 and update the Drizzle index** to use catalog item, currency and periodicity.
- [ ] **Step 4: Run the focused API tests** and confirm they pass.
- [ ] **Step 5: Commit** schema, migration and regression tests.

### Task 2: Normalize duplicate Lava catalog prices safely

**Files:**
- Modify: `apps/api/src/payments/lava.ts`
- Modify: `apps/api/src/payments/lava.test.ts`

**Interfaces:**
- Produces: catalog `prices` with at most one entry for each normalized `(currency, periodicity)` pair.

- [ ] **Step 1: Add a failing Lava adapter test** with monthly, 180-day and yearly RUB/USD/EUR entries plus an exact duplicate.
- [ ] **Step 2: Run** `pnpm --filter @club/api test -- src/payments/lava.test.ts` and confirm duplicate price entries remain.
- [ ] **Step 3: Implement normalization** that collapses exact duplicates and throws `LAVA_CATALOG_PRICE_CONFLICT` when the same currency-period pair contains different amounts.
- [ ] **Step 4: Run the Lava adapter tests** and confirm all pass.
- [ ] **Step 5: Commit** adapter normalization and tests.

### Task 3: Select the tariff's exact period prices

**Files:**
- Modify: `apps/web/src/features/billing/paymentProductForm.ts`
- Modify: `apps/web/src/features/billing/paymentProductForm.test.ts`

**Interfaces:**
- Produces: `lavaPeriodicityForTariff(kind, accessDays): string | null` and `lavaCatalogPricesForTariff(item, kind, accessDays)`.
- Consumes: catalog price entries with `currency`, `amountMinor` and `periodicity`.

- [ ] **Step 1: Add failing table-driven tests** for one-time, monthly, 90-day, 180-day and yearly selection and for a missing period.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- src/features/billing/paymentProductForm.test.ts` and confirm the helpers are missing.
- [ ] **Step 3: Implement the two pure helpers** and make `applyLavaCatalogItem` use only the selected period's prices.
- [ ] **Step 4: Run the focused web test** and confirm it passes.
- [ ] **Step 5: Commit** helpers and tests.

### Task 4: Compact selector and refreshed-price reconciliation

**Files:**
- Modify: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.test.ts`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.layout.test.ts`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`

**Interfaces:**
- Consumes: `kind`, new `accessDays` prop, `lavaCatalogPricesForTariff` and existing binding prices.
- Produces: `update:modelValue` with current fixed amounts and preserved `isEnabled` flags.

- [ ] **Step 1: Add failing component tests** proving only the matching period is shown, refreshing the catalog replaces amounts but preserves enabled currencies, and at least one currency remains enabled.
- [ ] **Step 2: Add a failing layout test** proving checkbox inputs are excluded from shared text-field sizing and currency codes cannot wrap.
- [ ] **Step 3: Run** `pnpm --filter @club/web test -- src/features/billing/PaymentProductBindings.test.ts src/features/billing/PaymentProductBindings.layout.test.ts` and confirm the new behavior fails.
- [ ] **Step 4: Add `accessDays`, filter options with the pure helper, reconcile selected catalog changes, and pass `productForm.accessDays` from `PaymentsSection.vue`.
- [ ] **Step 5: Replace the currency rows with compact accessible rows** using 20 px checkboxes, no-wrap codes, fixed-price output and responsive dynamic fields.
- [ ] **Step 6: Run the focused component tests** and confirm they pass.
- [ ] **Step 7: Commit** the component, integration prop and tests.

### Task 5: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Produces: release entry describing the catalog sync and currency selector fix.

- [ ] **Step 1: Add a failing release-note test** for the next application version.
- [ ] **Step 2: Run the focused release-note test** and confirm it fails.
- [ ] **Step 3: Add the release note and bump release/cache identifiers following the repository's current version pattern.**
- [ ] **Step 4: Run** `pnpm check`, `pnpm test`, and `pnpm build` and require zero failures.
- [ ] **Step 5: Commit and push `main`, deploy through the existing server update workflow, and wait for healthy status.**
- [ ] **Step 6: Trigger Lava catalog synchronization in production, verify success and inspect stored RUB/USD/EUR period rows; do not initiate checkout.**
- [ ] **Step 7: Verify the production UI at 320, 390, 768 and 1024 px and confirm no horizontal overflow.**

