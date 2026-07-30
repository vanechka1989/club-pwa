# Individual Subscription Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, single-client, single-payment subscription offers that admins create from a client card and deliver through in-app notification and web push.

**Architecture:** Store an immutable offer snapshot and only a SHA-256 token hash. Admin routes create, list, cancel, and repeat offers; authenticated client routes resolve the assigned offer and create one provider checkout at a time. Payment orders may reference either a shared product or an individual offer, while the existing webhook processor atomically grants access once.

**Tech Stack:** TypeScript, Bun/Hono, PostgreSQL/Drizzle, Zod, Vue 3, Pinia, Vitest, Playwright, Prodamus and Lava.top adapters.

## Global Constraints

- Offer lifetime is exactly 24 hours.
- A copied app link must not disclose or open an offer for a different authenticated user.
- One offer may produce at most one paid order and one access grant.
- The plaintext token must never be stored or logged.
- Prodamus supports RUB only; recurrent Prodamus offers require an external subscription ID.
- Lava.top fixed catalog prices cannot be overridden.
- Telegram and email delivery are out of scope.
- UI controls are at least 44×44 px and work at 375 px without horizontal scrolling.

---

### Task 1: Shared contracts and offer domain policy

**Files:**
- Create: `apps/api/src/payments/individualOfferPolicy.ts`
- Test: `apps/api/src/payments/individualOfferPolicy.test.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/paymentOffers.test.ts`

**Interfaces:**
- Produces `createIndividualOfferToken(): { token: string; tokenHash: string }` and `hashIndividualOfferToken(token: string): string`.
- Produces `resolveIndividualOfferAvailability(offer, userId, now)` returning `available | unavailable | expired | paid | cancelled` without exposing ownership.
- Produces shared `individualPaymentOfferSchema`, admin creation schemas, options response, and client detail/checkout response types.

- [ ] **Step 1: Write failing policy tests** for a 256-bit token, stable SHA-256 hash, foreign-user denial, the exact 24-hour boundary, paid/cancelled rejection, and retry eligibility after a failed order.
- [ ] **Step 2: Run `pnpm --filter @club/api test -- individualOfferPolicy.test.ts`** and verify failure because the module does not exist.
- [ ] **Step 3: Implement the minimal policy module** using `randomBytes(32)`, `createHash("sha256")`, and literal status transitions.
- [ ] **Step 4: Write failing shared-schema tests** using literal valid and invalid Prodamus/Lava payloads; verify recurrent Prodamus without `externalProductId` and non-RUB Prodamus fail.
- [ ] **Step 5: Add the shared schemas and inferred types**, then run both targeted suites until green.
- [ ] **Step 6: Commit** with `feat(payments): define individual offer contracts`.

### Task 2: Durable offer and order snapshots

**Files:**
- Create: `apps/api/drizzle/0063_individual_payment_offers.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Test: `apps/api/src/db/individualPaymentOfferSchema.test.ts`

**Interfaces:**
- Produces Drizzle tables `individualPaymentOffers` and relations.
- Extends `paymentOrders` with nullable `productId`, nullable `individualOfferId`, `productTitleSnapshot`, `productKindSnapshot`, and `accessDaysSnapshot`.
- Adds partial unique indexes for one `pending` and one `paid` order per offer.

- [ ] **Step 1: Write a failing schema/migration test** asserting foreign keys, token-hash uniqueness, status check, 24-hour timestamps, nullable product, non-null snapshot requirements for offer orders, and partial unique indexes.
- [ ] **Step 2: Run the targeted test** and verify failure on missing table/export.
- [ ] **Step 3: Add migration SQL and Drizzle schema** with `onDelete: restrict` for history and `onDelete: set null` only where loss of the relation is safe.
- [ ] **Step 4: Add relations and exported inferred types**, then run the targeted test and `pnpm --filter @club/api check`.
- [ ] **Step 5: Commit** with `feat(db): store individual payment offers`.

### Task 3: Admin creation, cancellation, history, and delivery

**Files:**
- Create: `apps/api/src/payments/individualOfferService.ts`
- Test: `apps/api/src/payments/individualOfferService.test.ts`
- Create: `apps/api/src/admin/individualOfferRoutes.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/admin/actionLog.ts` if a new typed action is required
- Modify: `apps/api/src/notifications/create.ts`
- Test: `apps/api/src/notifications/create.test.ts`

**Interfaces:**
- Produces `createIndividualOffer(input, actor)` returning the public token exactly once plus the serialized history item.
- Produces `cancelIndividualOffer(id, targetUserId, actor)` and `listIndividualOfferOptions()`.
- Adds `GET /admin/users/:telegramId/payment-offers/options`, `POST /admin/users/:telegramId/payment-offers`, and `POST /admin/users/:telegramId/payment-offers/:id/cancel`.
- Adds serialized offer history to the existing client detail response.

- [ ] **Step 1: Write failing service tests** for Prodamus snapshots, selectable Lava catalog snapshots, fixed-price enforcement, 24-hour expiry, token-hash-only persistence, notification HTML, and push URL `/payments/offers/<token>`.
- [ ] **Step 2: Verify RED**, then implement provider/catalog validation and transactional offer plus internal-notification persistence.
- [ ] **Step 3: Write failing route tests** for `accesses` permission, owner-only management of administrator targets, invalid fields, active recurrent conflict, cancellation ownership, and neutral not-found responses.
- [ ] **Step 4: Implement the routes and audit records** without logging tokens or full checkout URLs.
- [ ] **Step 5: Extend push delivery to optionally report success/failure** while preserving the internal notification when push fails.
- [ ] **Step 6: Run targeted API tests and check**, then commit with `feat(admin): create individual subscription offers`.

### Task 4: Assigned-client view and checkout

**Files:**
- Create: `apps/api/src/payments/individualOfferCheckout.ts`
- Test: `apps/api/src/payments/individualOfferCheckout.test.ts`
- Create: `apps/api/src/routes/individualPaymentOffers.ts`
- Test: `apps/api/src/routes/individualPaymentOffers.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Adds authenticated `GET /payments/offers/:token` returning a safe offer summary.
- Adds authenticated `POST /payments/offers/:token/checkout` returning `{ checkoutUrl, message }`.
- Produces `createIndividualOfferCheckout({ offer, user })`, using the existing provider adapters and immutable order snapshot.

- [ ] **Step 1: Write failing route tests** proving unknown and foreign tokens are indistinguishable, expired/cancelled offers cannot checkout, assigned users can view, and plaintext tokens never appear in logs or persisted rows.
- [ ] **Step 2: Implement token resolution and constant public error mapping**, then make view tests green.
- [ ] **Step 3: Write failing checkout tests** for one pending order under concurrent requests, retry after failed order, Prodamus recurrent ID, Lava catalog drift, client email requirement, and provider failure marking the order failed.
- [ ] **Step 4: Implement checkout creation** using a database transaction/advisory row lock and the existing adapters; persist only provider identifiers, not reusable app tokens.
- [ ] **Step 5: Mount the route and run targeted tests/check**, then commit with `feat(payments): open assigned individual offer checkout`.

### Task 5: Webhook idempotency and access grant

**Files:**
- Modify: `apps/api/src/payments/paymentEventProcessor.ts`
- Test: `apps/api/src/payments/paymentEventProcessor.test.ts`
- Create: `apps/api/src/payments/individualOfferPayment.test.ts`
- Modify: `apps/api/src/payments/paymentReconciliation.ts`

**Interfaces:**
- Resolves an order snapshot from either `paymentProducts` or `individualPaymentOffers`.
- Atomically changes the winning offer to `paid`, cancels competing pending attempts, marks one order paid, extends access, and emits the existing payment notification.

- [ ] **Step 1: Write failing processor tests** for a productless offer order, wrong amount/currency rejection, a late webhook for an older failed attempt, duplicate webhook, and two competing success events.
- [ ] **Step 2: Verify RED**, then refactor snapshot resolution without changing shared-product behavior.
- [ ] **Step 3: Implement the offer row lock and atomic winning-payment transition**, ensuring exactly one subscription insert.
- [ ] **Step 4: Add reconciliation coverage** so offer orders can be diagnosed without a shared product.
- [ ] **Step 5: Run all payment API tests**, then commit with `feat(payments): settle individual offers once`.

### Task 6: Client payment-offer screen

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/billing/IndividualPaymentOfferScreen.vue`
- Test: `apps/web/src/features/billing/IndividualPaymentOfferScreen.test.ts`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/app/taskNavigation.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/features/app/notificationRoute.css`

**Interfaces:**
- Produces `getIndividualPaymentOffer(token)` and `checkoutIndividualPaymentOffer(token)`.
- Renders `/payments/offers/:token` inside the Payments section.

- [ ] **Step 1: Write failing component tests** for offer summary, 24-hour deadline, loading/error/paid/expired states, one primary checkout button, and confirmation before external redirect.
- [ ] **Step 2: Implement typed API methods and the screen** with accessible labels, a 44 px minimum target, safe token encoding, and no foreign-user details.
- [ ] **Step 3: Add task navigation and responsive CSS**, then run component, router, notification, and checkout tests.
- [ ] **Step 4: Commit** with `feat(web): show individual payment offers`.

### Task 7: Admin client-card form and history

**Files:**
- Create: `apps/web/src/features/admin/AdminIndividualOfferDialog.vue`
- Test: `apps/web/src/features/admin/AdminIndividualOfferDialog.test.ts`
- Create: `apps/web/src/features/admin/adminIndividualOffers.ts`
- Test: `apps/web/src/features/admin/adminIndividualOffers.test.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/adminRoute.css`

**Interfaces:**
- Adds typed admin API methods for options, create, and cancel.
- Dialog emits `created` with the one-time copyable app link and `close`.
- Client history uses serialized offer records and exposes cancel/repeat actions without recovering plaintext tokens.

- [ ] **Step 1: Write failing helper tests** for status labels, amount formatting, Prodamus/Lava field validation, and repeat-prefill behavior.
- [ ] **Step 2: Implement helpers**, then write failing dialog tests for provider choice, progressive fields, fixed Lava prices, Prodamus recurrent ID, confirmation summary, loading, and inline errors.
- [ ] **Step 3: Implement the dialog**, then add the failing client-card test for the «Выдать подписку» button, permission state, history rows, cancellation, and repeat action.
- [ ] **Step 4: Wire state/API in `AdminSection.vue`** and add responsive semantic-token CSS with reduced-motion support.
- [ ] **Step 5: Run admin/web tests and check**, then commit with `feat(admin): issue subscriptions from client cards`.

### Task 8: Security, release regression, and documentation

**Files:**
- Create: `apps/api/src/security/individualPaymentOffers.test.ts`
- Modify: `tests/e2e/app.spec.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/public/sw.js`
- Create: `docs/operations/individual-payment-offers.md`

**Interfaces:**
- Provides a release-level regression and operator runbook.

- [ ] **Step 1: Add security tests** for BOLA, token enumeration, expired/replayed links, concurrent checkout, XSS in offer titles, and absence of tokens in audit/log payloads.
- [ ] **Step 2: Add E2E coverage** for the admin creation flow and 375 px layout using deterministic mocked APIs, then verify it fails before final wiring and passes after.
- [ ] **Step 3: Add release note/version and service-worker cache bump** following the repository's release convention.
- [ ] **Step 4: Document provider prerequisites, 24-hour lifecycle, cancellation, audit, incident response, and the card-owner limitation.**
- [ ] **Step 5: Run `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`** and fix every regression through a failing test.
- [ ] **Step 6: Commit** with `docs: release individual subscription offers`.
