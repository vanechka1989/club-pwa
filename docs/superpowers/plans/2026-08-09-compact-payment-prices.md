# Compact Payment Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant zero cents from every displayed price while preserving real fractional amounts.

**Architecture:** Keep `formatPaymentMoney` as the single formatter and route the personal-offer screen through it. No payment calculations or API contracts change.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, Intl.NumberFormat.

## Global Constraints

- Integer amounts render without a decimal part.
- Non-zero minor units remain visible with up to two digits.
- Existing currencies and `ru-RU` localization remain unchanged.
- Implement test-first.

---

### Task 1: Shared payment display formatter

**Files:**
- Modify: `apps/web/src/features/billing/paymentMoney.test.ts`
- Modify: `apps/web/src/features/billing/paymentMoney.ts`

**Interfaces:**
- Produces: `formatPaymentMoney(money): string` with zero-to-two fraction digits.

- [ ] Add literal expectations for `500 ₽`, `500,50 ₽`, `$20`, `$19,99`, `17,50 €` and `18 €`.
- [ ] Run the focused test and confirm integer cases fail with trailing zero cents.
- [ ] Set `minimumFractionDigits: 0` and `maximumFractionDigits: 2` in the shared formatter.
- [ ] Run the focused test and confirm all cases pass.

### Task 2: Personal offers and client journey

**Files:**
- Modify: `apps/web/src/features/billing/IndividualPaymentOfferScreen.vue`
- Modify: `tests/e2e/customerJourney.audit.spec.ts`

**Interfaces:**
- Consumes: `formatPaymentMoney` from Task 1.

- [ ] Change the E2E expectation to the compact price and confirm it fails before implementation.
- [ ] Replace the offer screen's local `Intl.NumberFormat` with `formatPaymentMoney`.
- [ ] Run billing tests and the mobile customer journey.

### Task 3: Release and publication

**Files:**
- Modify the existing release/version files following the project release pattern.

- [ ] Add a release note describing compact prices.
- [ ] Run workspace tests, type checks and production build.
- [ ] Merge to `main`, push, wait for deployment and verify the live bundle and API health.
