# Task 1: Money contracts and database model

## Files changed

- `packages/shared/src/index.ts` and `packages/shared/src/paymentProviders.test.ts`
- `apps/api/src/payments/money.ts`, `money.test.ts`, `multicurrencyModel.test.ts`
- `apps/api/src/payments/providerAdapter.ts`, `lava.ts`, `lava.test.ts`, `lavaWebhook.ts`, `lavaWebhook.test.ts`
- `apps/api/src/db/schema.ts`, `apps/api/drizzle/0058_lava_multicurrency.sql`, and `apps/api/drizzle/meta/_journal.json`
- Compatibility call sites: payments routes/event processing/reconciliation, acquisition analytics, and the billing form.

## RED evidence

Before production changes, the focused test command was run:

```text
pnpm --filter @club/shared test -- paymentProviders.test.ts
pnpm --filter @club/api test -- src/payments/multicurrencyModel.test.ts src/payments/lavaWebhook.test.ts src/payments/lava.test.ts
```

It failed as expected: shared schemas stripped `prices` (`expected undefined`), invalid GBP/zero minor-unit price inputs were accepted, new order snapshot/table fields were absent, Lava sent `{ currency: "RUB", amount: 0 }` instead of the requested `{ currency: "USD", amount: 19.99 }`, and the webhook returned lower-case `usd` with no `amountMinor`.

## Implementation

- Added exactly `RUB`, `USD`, and `EUR`, public `{ currency, amountMinor }` money validation, catalog-price validation (dynamic amount nullable), and binding-price validation.
- Price arrays default during schema parsing so old response fixtures remain parseable; legacy `amountRub` is nullable for Lava-only products.
- Added decimal-safe conversion helpers. They accept numeric/string major units, reject malformed or over-two-decimal inputs, and use integer/`BigInt` arithmetic before provider payload conversion.
- Added normalized `amountMinor` and constrained currency fields; Lava catalog parsing now preserves every supported currency price, checkout accepts the money snapshot, and webhooks normalize case plus minor units.
- Added DB enum, catalog/binding price tables and relations, nullable legacy RUB columns, immutable order `currency`/`amount_minor`, positive constraints, RUB backfill, migration journal entry, and inferred price types.
- Kept current RUB checkout compatibility by snapshotting RUB orders at creation; renewal orders inherit the parent snapshot. No UI/persistence flow for selecting non-RUB prices was added (reserved for later tasks).

## Verification

Focused checks:

```text
pnpm --filter @club/shared test -- paymentProviders.test.ts
# 1 file, 8 tests passed

pnpm --filter @club/api test -- src/payments/money.test.ts src/payments/multicurrencyModel.test.ts src/payments/paymentSchemaMigration.test.ts src/payments/lavaWebhook.test.ts src/payments/lava.test.ts
# 5 files, 24 tests passed
```

Package suites:

```text
pnpm --filter @club/shared test
# 15 files, 46 tests passed

pnpm --filter @club/api test
# 152 files, 475 tests passed
```

Type checks:

```text
pnpm check
# shared tsc, api tsc, and web vue-tsc passed
```

`git diff --check` also passed.

## Self-review

- Currency values are constrained in both shared contracts and PostgreSQL.
- All minor-unit values that are public/order/binding amounts are positive; catalog dynamic values alone allow `null`.
- Existing order rows receive `RUB` and `amount_rub * 100` before new columns become non-null.
- Existing RUB paths continue to use RUB snapshots; rows with a null legacy amount are excluded from RUB acquisition totals.
- New tables have composite uniqueness by the required parent ID and currency, foreign keys, and Drizzle relations.

## Concerns

- The migration was verified structurally and by type/test suites, not applied to a live PostgreSQL instance in this task. No payment/network operation was performed.
- Currency selection, price persistence, and exact webhook reconciliation enforcement beyond the normalized contract are intentionally deferred to the follow-up tasks.
