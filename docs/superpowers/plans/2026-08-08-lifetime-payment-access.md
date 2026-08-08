# Lifetime Payment Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add true non-expiring access to shared payment products and individual offers for Prodamus and Lava.

**Architecture:** Keep payment recurrence in `PaymentProductKind` and introduce an orthogonal `PaymentAccessType` (`limited | lifetime`). Persist and snapshot the access type, resolve successful payments through one expiry helper, and make membership selection prefer active rows with no expiry.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle/PostgreSQL, Vue 3, Vitest, Playwright.

## Global Constraints

- Lifetime access is valid only for `one_time` payments.
- Lifetime access stores `accessDays = null` and grants a subscription with `expiresAt = null`.
- A later limited purchase must never override active lifetime access.
- Both shared products and individual offers support lifetime access through Prodamus and Lava.
- Existing products and offers remain limited during migration.

---

### Task 1: Shared access contract and database migration

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/paymentProviders.test.ts`
- Modify: `packages/shared/src/paymentOffers.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0070_lifetime_payment_access.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `paymentAccessTypeSchema`, `PaymentAccessType`, nullable `accessDays`, and cross-field validation for product and individual-offer payloads.
- Produces: `accessType` columns on products/offers and `accessTypeSnapshot` on payment orders.

- [ ] Write failing shared-schema tests proving `{ kind: "one_time", accessType: "lifetime", accessDays: null }` parses and invalid limited/recurrent combinations fail.
- [ ] Run `pnpm --filter @club/shared test -- paymentProviders.test.ts paymentOffers.test.ts` and confirm the new assertions fail because `accessType` is absent.
- [ ] Add the shared schema/type fields and conditional validation, preserving `limited` as the input default for compatibility.
- [ ] Update Drizzle tables and add migration 0070: add access type columns with `limited` defaults, drop `NOT NULL` from product/offer access days, add consistency checks, and add the order snapshot column.
- [ ] Run the focused shared tests and `pnpm --filter @club/shared check`; confirm they pass.
- [ ] Commit the contract and migration.

### Task 2: Snapshot and expiry-domain rules

**Files:**
- Modify: `apps/api/src/payments/paymentOrderSnapshot.ts`
- Modify: `apps/api/src/payments/paymentOrderSnapshot.test.ts`
- Modify: `apps/api/src/payments/paymentEventRules.ts`
- Create: `apps/api/src/payments/paymentEventRules.test.ts`

**Interfaces:**
- Consumes: `PaymentAccessType` and nullable `accessDays` from Task 1.
- Produces: resolved snapshots containing `accessType` and `accessDays`.
- Produces: `getPaidAccessExpiry(now, currentExpiry, accessType, accessDays): Date | null`.

- [ ] Write failing tests for lifetime product/offer snapshots and for `getPaidAccessExpiry` returning `null` for lifetime while retaining the current extension calculation for limited access.
- [ ] Run the two focused tests and verify expected failures from the missing fields/helper.
- [ ] Implement snapshot resolution and the expiry helper with explicit rejection of an impossible limited snapshot without days.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit the domain rules.

### Task 3: Payment checkout and successful access grants

**Files:**
- Modify: `apps/api/src/payments/providerAdapter.ts`
- Modify: `apps/api/src/payments/checkoutOrchestration.ts`
- Modify: `apps/api/src/payments/paymentEventProcessor.ts`
- Modify: `apps/api/src/payments/checkoutOrchestration.test.ts`
- Modify: `apps/api/src/payments/paymentEventProcessor.test.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Modify: relevant route tests under `apps/api/src/routes`

**Interfaces:**
- Consumes: snapshot `accessType` and `getPaidAccessExpiry` from Task 2.
- Produces: Prodamus and Lava checkout/grant paths that persist snapshots and write `expiresAt = null` for lifetime.

- [ ] Write failing API tests proving both generic provider events and the Prodamus webhook grant lifetime access without an expiry and preserve idempotency.
- [ ] Run the focused API tests and verify they fail because grants still calculate days.
- [ ] Thread `accessType` through checkout creation, order snapshots and both successful-payment paths; keep provider checkout semantics one-time.
- [ ] Replace direct expiry arithmetic with `getPaidAccessExpiry`.
- [ ] Run the focused API tests and confirm they pass.
- [ ] Commit payment processing support.

### Task 4: Lifetime membership precedence

**Files:**
- Modify: `apps/api/src/membership/getMembership.ts`
- Create or modify: `apps/api/src/membership/getMembership.test.ts`
- Modify: `apps/api/src/membership/currentAccess.ts`
- Modify: `apps/api/src/membership/currentAccessData.ts`
- Modify: `apps/api/src/membership/currentAccess.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: membership lookup that prefers active `expiresAt = null` rows and `CurrentAccess.source = "lifetime"` for paid permanent access.

- [ ] Write failing tests with an older lifetime subscription and a newer limited subscription, expecting lifetime membership and profile data.
- [ ] Run the membership tests and verify the lookup/source assertions fail.
- [ ] Implement precedence in the membership query and map paid null-expiry products to the lifetime current-access source.
- [ ] Run membership tests and confirm they pass.
- [ ] Commit membership precedence.

### Task 5: Admin product form and tariff display

**Files:**
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/billing/paymentProductForm.ts`
- Modify: `apps/web/src/features/billing/paymentProductForm.test.ts`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Consumes: `PaymentAccessType` and nullable `accessDays`.
- Produces: tariff form access-mode selector and `productPeriod()` lifetime label.

- [ ] Write failing component/helper tests for choosing lifetime, hiding the days input, resetting lifetime to limited when recurrent is selected, and rendering «Постоянный доступ».
- [ ] Run focused web tests and verify failures.
- [ ] Implement the form state, request payload, conditional fields, Lava binding compatibility and tariff label.
- [ ] Run focused web tests and confirm they pass.
- [ ] Commit the shared tariff UI.

### Task 6: Personal offers and profile copy

**Files:**
- Modify: `apps/web/src/features/admin/AdminIndividualOfferCard.vue`
- Modify: its focused component test or add `apps/web/src/features/admin/AdminIndividualOfferCard.test.ts`
- Modify: `apps/web/src/features/billing/IndividualPaymentOfferScreen.vue`
- Modify: its focused test or add `apps/web/src/features/billing/IndividualPaymentOfferScreen.test.ts`
- Modify: `apps/web/src/features/profile/profileAccess.ts`
- Modify: `apps/web/src/features/profile/profileAccess.test.ts`
- Modify: `apps/api/src/payments/individualOfferService.ts`
- Modify: `apps/api/src/payments/individualOfferService.test.ts`
- Modify: `apps/api/src/routes/adminIndividualPaymentOffers.ts`
- Modify: `apps/api/src/routes/individualPaymentOffers.ts`

**Interfaces:**
- Produces: lifetime-capable personal-offer payloads, messages, history and customer-facing labels.

- [ ] Write failing tests for lifetime personal-offer creation, message text, payment-page benefit, history label and profile text.
- [ ] Run focused tests and verify lifetime cases fail.
- [ ] Implement access-mode controls and conditional payloads; replace all lifetime day copy with «Постоянный доступ» or «Без ограничения срока».
- [ ] Run focused tests and confirm they pass.
- [ ] Commit personal offers and profile presentation.

### Task 7: Regression and release verification

**Files:**
- Modify: `tests/e2e/app.spec.ts` only if the existing mocked payment fixtures require the new defaulted field or a focused lifetime UI assertion is needed.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified repository state.

- [ ] Run all payment, membership, shared-contract and profile unit tests.
- [ ] Run `pnpm -r check` and resolve type errors without weakening schemas.
- [ ] Run `pnpm -r test`.
- [ ] Run `pnpm -r build`.
- [ ] Review `git diff --check`, migration SQL and changed copy for contradictions or accidental unrelated edits.
- [ ] Commit any final integration-only corrections.
