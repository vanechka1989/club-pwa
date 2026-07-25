# Lava Product Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move payment provider selection to the top of the tariff form and automatically fill tariff fields from the selected Lava catalog item.

**Architecture:** Keep provider binding and catalog selection inside `PaymentProductBindings.vue`, but emit the selected catalog record to the parent. Apply catalog data through a pure form helper so mapping and periodicity behavior are independently testable.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library, Playwright.

## Global Constraints

- Exactly one payment provider remains enabled.
- Missing Lava values must not overwrite valid form values.
- All automatically filled fields remain editable.
- Mobile layout must not overflow from 320 pixels upward.

---

### Task 1: Catalog-to-form mapping

**Files:**
- Create: `apps/web/src/features/billing/paymentProductForm.ts`
- Create: `apps/web/src/features/billing/paymentProductForm.test.ts`

**Interfaces:**
- Produces: `applyLavaCatalogItem(form, item)` returning updated `kind`, `title`, `amountRub`, and `accessDays`.

- [ ] **Step 1: Write failing tests for title, price, kind, periodicity, and missing values**
- [ ] **Step 2: Run the focused test and confirm failure because the helper does not exist**
- [ ] **Step 3: Implement the minimal pure mapping helper**
- [ ] **Step 4: Run the focused test and confirm it passes**

### Task 2: Selection event and form order

**Files:**
- Modify: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.test.ts`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/billing/paymentProviderStyle.test.ts`

**Interfaces:**
- `PaymentProductBindings` emits `lava-item-selected` with a `PaymentProviderCatalogItem`.
- `PaymentsSection` applies that item through `applyLavaCatalogItem`.

- [ ] **Step 1: Write failing tests for the selection event and provider-first form order**
- [ ] **Step 2: Run focused tests and confirm the expected failures**
- [ ] **Step 3: Emit the selected item and handle it in the parent form**
- [ ] **Step 4: Move `PaymentProductBindings` above type, title, price, and access fields**
- [ ] **Step 5: Run focused tests and confirm they pass**

### Task 3: Correct Lava checkout amount

**Files:**
- Modify: `apps/api/src/payments/providerAdapter.ts`
- Modify: `apps/api/src/payments/lava.ts`
- Modify: `apps/api/src/payments/lava.test.ts`
- Modify: `apps/api/src/routes/payments.ts`

**Interfaces:**
- `ProviderCheckoutInput.product.useCustomAmount` is true only for a catalog item without a fixed RUB price.

- [ ] **Step 1: Write a failing test proving fixed-price invoices omit `amount`**
- [ ] **Step 2: Write a failing test proving dynamic-price invoices include `amount`**
- [ ] **Step 3: Derive price mode from the synced Lava catalog in the checkout route**
- [ ] **Step 4: Build the Lava payload conditionally and run focused tests**

### Task 4: Release verification and deployment

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Current release becomes version `5.57`.

- [ ] **Step 1: Update release metadata and regression expectations**
- [ ] **Step 2: Run checks, full tests, build, release tests, and device tests**
- [ ] **Step 3: Commit and push `main`**
- [ ] **Step 4: Wait for successful deployment and verify production health and release notification**
