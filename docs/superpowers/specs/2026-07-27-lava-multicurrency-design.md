# Lava Multicurrency Design

## Goal

Support RUB, USD, and EUR prices from one Lava offer end to end: an administrator chooses which offer currencies are available, a client chooses one of those currencies before checkout, and payment/recurrent webhooks validate the exact currency and amount that were ordered.

## Root cause

The Lava catalog response already contains `offer.prices`, but the integration keeps only the RUB entry, rounds it to whole units, sends `currency: "RUB"` during checkout, and validates every webhook as RUB. A foreign-currency webhook therefore cannot pass even when Lava sends a valid payment.

## Money model

Money is represented as an ISO currency plus integer minor units:

```ts
type PaymentCurrency = "RUB" | "USD" | "EUR";
type Money = { currency: PaymentCurrency; amountMinor: number };
```

Integer minor units prevent loss of cents. The authoritative Lava prices are not exchange-rate conversions: each currency has its own price from Lava or its own administrator-entered dynamic price.

The database gains:

- `payment_provider_catalog_item_prices`: every synced offer price, including nullable amount for Lava dynamic-price offers;
- `payment_product_provider_prices`: the subset enabled for a product binding and the exact configured amount;
- `payment_orders.currency` and `payment_orders.amount_minor`: an immutable checkout snapshot.

Existing RUB columns remain temporarily for compatibility. Existing orders are backfilled as RUB. New foreign orders leave the legacy RUB amount empty so analytics never add USD/EUR nominal values into RUB revenue. A Lava-only product may have no legacy RUB price; Prodamus still requires a RUB price.

## Catalog and administration

Catalog sync stores all supported Lava prices without rounding major units. Catalog and offer selectors display every available price.

After selecting Lava in the add/edit tariff screen, the administrator sees RUB, USD, and EUR choices available for that offer:

- fixed Lava prices are shown read-only;
- dynamic-price currencies have an editable amount;
- at least one currency must be enabled;
- unsupported currencies and invalid/non-positive amounts are rejected by the API;
- stale offers cannot be newly bound.

Manual Lava IDs remain supported. Because no fixed catalog price can be verified for a manual offer, their enabled currency amounts are treated as explicit dynamic prices.

## Client checkout

Published products expose their enabled price list. Cards format each price with `Intl.NumberFormat` and do not infer currency from locale.

If a product has multiple prices, pressing `Оплатить` opens a dedicated currency picker. If it has one price, that currency is selected automatically. Provider choice, where applicable, remains a separate decision. Checkout sends `{ productId, provider?, currency }`.

The API re-resolves the enabled binding and stored price, rejects an absent/disabled currency before creating an order, snapshots `amountMinor + currency`, and passes that same pair to Lava. The client never supplies an amount.

## Webhooks and reconciliation

Lava webhook currency is uppercased and restricted to RUB/USD/EUR. Incoming major-unit amounts are converted to minor units with a decimal-safe helper. Payment and renewal events compare the exact `(currency, amountMinor)` pair against the parent order snapshot. A currency mismatch or one-cent difference is rejected; valid foreign payments follow the same idempotent access-grant path as RUB.

Renewal orders inherit the parent order currency and amount snapshot. Reconciliation uses the same normalized event contract, so it cannot silently reintroduce RUB-only validation.

Notifications and payment logs format the stored currency. Existing RUB revenue fields count only RUB orders; no implicit FX conversion is introduced.

## Failure handling

- Unsupported or disabled currency: HTTP 400 without order creation.
- Multiple enabled currencies without a choice: response asks for currency selection.
- Catalog fixed price changed after configuration: HTTP 409 and an administrator-facing refresh message.
- Webhook amount/currency mismatch: non-success response so Lava retries, while access is not granted.
- Duplicate webhook: existing idempotency behavior remains unchanged.

## Verification

Tests cover three-currency catalog parsing, decimal minor-unit conversion, admin selection, checkout snapshotting, Lava request payloads, webhook and reconciliation success/mismatch cases, renewal inheritance, notifications, payment logs, and the client currency picker. No real payment is performed.

Official behavior was checked against Lava's current API documentation: invoice creation accepts `currency` and `amount`, supports RUB/USD/EUR, and webhook authentication uses `X-Api-Key`.
