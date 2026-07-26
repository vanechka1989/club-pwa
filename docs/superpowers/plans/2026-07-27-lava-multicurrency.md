# Lava Multicurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators expose selected RUB/USD/EUR Lava prices and let clients pay in a chosen currency with exact webhook validation.

**Architecture:** Store money in integer minor units, normalize all Lava catalog/event data, persist binding prices and immutable order snapshots, and keep the currency selection server-authoritative.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle/PostgreSQL, Vue 3, Vitest, Playwright.

## Global Constraints

- Never perform a real payment.
- Only RUB, USD, and EUR are supported.
- Never convert currencies or combine foreign nominal amounts into RUB analytics.
- The client chooses currency but never supplies an amount.
- Webhook and reconciliation compare exact currency plus minor units.
- Preserve Prodamus behavior and existing orders.

---

### Task 1: Money contracts and database model

**Files:** shared payment schemas/tests, API payment money helper/tests, `apps/api/src/db/schema.ts`, migration `0058_lava_multicurrency.sql`, migration journal.

- [ ] Add failing tests for supported currencies, minor-unit conversion, catalog prices, binding prices, and order money fields.
- [ ] Add `PaymentCurrency`, money/price schemas, decimal-safe major/minor helpers, and normalized event fields.
- [ ] Add catalog-price and binding-price tables plus order snapshot columns; backfill existing rows as RUB.
- [ ] Keep legacy RUB fields compatible while making Lava-only non-RUB products possible.
- [ ] Run shared/API checks and focused tests.

### Task 2: Lava catalog, adapters, webhooks, and reconciliation

**Files:** `apps/api/src/payments/lava.ts`, provider adapter/types, Lava/Prodamus webhook adapters, event rules/processor, reconciliation, notifications, related tests.

- [ ] Add failing tests proving all three catalog prices and cents survive normalization.
- [ ] Make checkout send the selected currency and exact amount.
- [ ] Normalize webhook/status events to `amountMinor + currency` and validate all supported currencies.
- [ ] Make renewals inherit and validate the parent order snapshot.
- [ ] Format notifications using stored currency and preserve idempotency.
- [ ] Run all payment unit tests.

### Task 3: Product administration and checkout API

**Files:** payment routes/services and route tests.

- [ ] Add failing route/service tests for saving selected currencies, fixed-price drift, dynamic prices, missing/disabled currency, and immutable order snapshots.
- [ ] Persist every catalog price during sync and return them in admin/public contracts.
- [ ] Validate/save enabled binding prices on product create/update.
- [ ] Resolve currency server-side during checkout and pass the stored price to the adapter.
- [ ] Keep RUB-only analytics honest and return currency-aware payment logs.
- [ ] Run API checks and focused/full API tests.

### Task 4: Administrator and client UI

**Files:** billing form helpers/components, `PaymentsSection.vue`, API client, payment/profile/admin displays, related tests and styles.

- [ ] Add failing component tests for catalog price display and multi-select currency configuration.
- [ ] Add fixed read-only and dynamic editable currency rows to the Lava product form.
- [ ] Add formatted product price lists and a dedicated client currency picker.
- [ ] Send selected currency to checkout and format logs/notifications without hard-coded rouble signs.
- [ ] Verify keyboard access, touch targets, 320 px layout, and all themes.
- [ ] Run web checks and tests.

### Task 5: Integration verification

- [ ] Run shared/API/web checks and full unit tests.
- [ ] Run production build and migration smoke tests.
- [ ] Exercise RUB/USD/EUR checkout and webhook fixtures without contacting a real payment endpoint.
- [ ] Run release E2E/device tests across Chromium, Firefox, WebKit, Android, and iOS profiles.
