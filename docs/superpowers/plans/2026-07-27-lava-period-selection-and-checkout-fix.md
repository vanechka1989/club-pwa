# Lava Period Selection and Checkout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Lava fixed-price checkout and expose every synced subscription period as a clear administrator choice.

**Architecture:** Keep the existing one-product/one-access-period data model. Derive supported period options from catalog price rows, let the tariff form emit a selected `accessDays`, and let existing price synchronization update currencies. Present catalog prices grouped by periodicity. The Lava adapter sends an amount only for dynamic-price offers.

**Tech Stack:** TypeScript, Hono, Vue 3, Vitest, Testing Library Vue, pnpm.

## Global Constraints

- Do not conduct an actual payment.
- Preserve server-side period and catalog-price validation.
- Support RUB, USD, and EUR for one-time and recurrent Lava products.
- Keep one enabled payment provider per tariff.

---

### Task 1: Correct fixed-price Lava checkout

**Files:**
- Modify: `apps/api/src/payments/lava.ts`
- Test: `apps/api/src/payments/lava.test.ts`

**Interfaces:**
- Consumes: `ProviderCheckoutInput.product.useCustomAmount`.
- Produces: a v3 invoice body where `amount` exists only when `useCustomAmount === true`.

- [x] **Step 1: Add failing fixed-price tests** asserting that one-time USD and recurrent USD bodies omit `amount`, while dynamic offers retain exact cents.
- [x] **Step 2: Run `pnpm --filter @club/api test -- src/payments/lava.test.ts`** and confirm the new assertions fail.
- [x] **Step 3: Compute `customAmount` only inside the `useCustomAmount` branch** and conditionally spread `{ amount: customAmount }` into the request body.
- [x] **Step 4: Run the Lava, checkout money, and checkout orchestration tests** and confirm all pass.

### Task 2: Add reusable Lava period options

**Files:**
- Modify: `apps/web/src/features/billing/paymentProductForm.ts`
- Test: `apps/web/src/features/billing/paymentProductForm.test.ts`

**Interfaces:**
- Produces: `lavaCatalogPeriodOptions(item)` returning ordered `{ periodicity, accessDays, label }` objects.
- Produces: `lavaCatalogPeriodLabel(periodicity)` for catalog grouping.

- [x] **Step 1: Add failing tests** for ordered 1/3/6/12-month discovery, duplicate removal, unsupported-period omission, and fallback selection.
- [x] **Step 2: Run the focused test** and confirm the missing exports fail.
- [x] **Step 3: Implement the helpers** with `MONTHLY=30`, `PERIOD_90_DAYS=90`, `PERIOD_180_DAYS=180`, and `PERIOD_YEAR=365`.
- [x] **Step 4: Update `applyLavaCatalogItem`** to retain a currently available period or choose the first available period.
- [x] **Step 5: Run the focused test** and confirm it passes.

### Task 3: Render and apply the period selector

**Files:**
- Modify: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Test: `apps/web/src/features/billing/PaymentProductBindings.test.ts`

**Interfaces:**
- Produces: `lava-period-selected(accessDays: number)`.
- Consumes: parent `productForm.accessDays` and existing fixed-price watcher.

- [x] **Step 1: Add a failing component test** that selects “6 месяцев”, observes `lava-period-selected` with `180`, then rerenders and sees only 180-day prices.
- [x] **Step 2: Run the focused component test** and confirm it fails because the selector is absent.
- [x] **Step 3: Add an accessible segmented radio group** labelled “Период подписки”, showing only available periods.
- [x] **Step 4: Handle the event in `PaymentsSection.vue`** by assigning `productForm.accessDays`, and keep “Дней доступа” read-only for selected recurrent Lava offers.
- [x] **Step 5: Run the component and form tests** and confirm they pass.

### Task 4: Group catalog prices by period

**Files:**
- Modify: `apps/web/src/features/billing/LavaCatalogList.vue`
- Test: `apps/web/src/features/billing/LavaCatalogList.test.ts`

**Interfaces:**
- Consumes: `lavaCatalogPeriodLabel(periodicity)`.
- Produces: separate labelled price lines per period.

- [x] **Step 1: Add a failing test** that expects “1 месяц” and “6 месяцев” on separate rows with their matching currencies.
- [x] **Step 2: Run the focused test** and confirm the flat presentation fails.
- [x] **Step 3: Group prices by normalized periodicity** and render each group as a compact line.
- [x] **Step 4: Run the catalog and billing component tests** and confirm they pass.

### Task 5: Release and production verification

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: the next app version and service-worker cache revision.

- [x] **Step 1: Update release metadata** with the checkout and period-selection changes.
- [x] **Step 2: Run focused tests, full checks, full tests, and production builds.**
- [ ] **Step 3: Commit and push `main`**, allowing the existing deployment workflow to deploy the exact commit.
- [ ] **Step 4: Verify production health, deployed commit, and UI assets.**
- [ ] **Step 5: Create payment links for one-time and recurrent foreign-currency tariffs without completing payment**, and confirm Lava returns HTTPS checkout URLs.
