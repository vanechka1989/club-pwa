# Lava Owner Test Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the club owner to configure a separate buyer email for Lava test checkouts without affecting client payments.

**Architecture:** Store an optional test email on the Lava payment provider, expose it only through the admin provider contract, and resolve the checkout buyer email from owner status at the payment boundary. Keep webhook ownership tied to the existing order identifier.

**Tech Stack:** TypeScript, Bun, Hono, Drizzle/PostgreSQL, Vue 3, Zod, Vitest.

## Global Constraints

- Apply the override only to the owner role.
- Preserve member and admin checkout emails.
- Do not complete a real payment.

---

### Task 1: Persist and expose the test email

**Files:** `apps/api/src/db/schema.ts`, `apps/api/drizzle/0060_lava_test_buyer_email.sql`, `packages/shared/src/index.ts`, `apps/api/src/payments/providerAdminService.ts`

- [ ] Add failing schema and mapper tests for `testBuyerEmail`.
- [ ] Add the nullable database column and migration.
- [ ] Extend the admin provider contract and mapper.
- [ ] Run the focused shared and API tests.

### Task 2: Save and apply the owner override

**Files:** `apps/api/src/routes/payments.ts`, `apps/api/src/payments/lavaCheckoutBuyer.ts`, `apps/api/src/payments/lavaCheckoutBuyer.test.ts`, `apps/api/src/payments/lava.ts`, `apps/api/src/payments/lava.test.ts`, `apps/api/src/payments/checkoutCurrencyResponse.ts`

- [ ] Write failing tests for owner/member selection and the Lava email rejection.
- [ ] Validate and save the optional email in the Lava provider route.
- [ ] Resolve the effective buyer email before checkout and use it in the adapter request.
- [ ] Return a specific safe error when Lava rejects the buyer email.
- [ ] Run focused API tests.

### Task 3: Add the mobile-first setting

**Files:** `apps/web/src/features/billing/lavaProviderForm.ts`, `apps/web/src/features/billing/lavaProviderForm.test.ts`, `apps/web/src/features/billing/PaymentsSection.vue`, `apps/web/src/api/client.ts`

- [ ] Write failing form tests that preserve and submit `testBuyerEmail`.
- [ ] Add the labeled email input and concise help text to Lava connection settings.
- [ ] Keep the field full-width with a 44 px minimum control height.
- [ ] Run focused web tests.

### Task 4: Release and verification

**Files:** `packages/shared/src/index.ts`, `apps/web/src/features/app/releaseHistory.ts`, `apps/web/src/features/app/releaseNotes.ts`, `apps/web/public/sw.js`

- [ ] Publish release 5.72 and increment the PWA cache.
- [ ] Run `pnpm check`, `pnpm test`, and `pnpm build`.
- [ ] Commit, push, wait for deployment, and verify production health.
- [ ] Create unpaid Lava checkout links with the configured test email and confirm no payment is completed.
