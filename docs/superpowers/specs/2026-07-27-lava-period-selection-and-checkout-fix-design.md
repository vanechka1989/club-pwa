# Lava period selection and checkout fix

## Goal

Make every synced Lava subscription period selectable while keeping one club tariff bound to one billing period, and restore fixed-price checkout in RUB, USD, and EUR without charging a customer during verification.

## Decisions

- The administrator selects the subscription period in the tariff form; one tariff grants one fixed access period.
- The client selects only the enabled checkout currency.
- The period selector lists only periods present in the selected Lava offer: 1 month, 3 months, 6 months, and 1 year.
- Selecting a period updates `accessDays` and reloads the exact catalog prices for that period.
- The numeric access-days field remains editable for Prodamus and one-time products, but is derived and read-only for a recurrent Lava tariff.
- The provider catalog groups prices into labelled period rows instead of concatenating all prices.
- Fixed Lava offers omit `amount` in `POST /api/v3/invoice`; dynamic-price offers continue to send it.
- Verification may create a payment URL but must not complete a payment.

## Error handling

- Unsupported or missing recurrent periods are not shown.
- A period with no usable currency prices cannot be selected.
- Existing enabled currency choices are preserved where that currency exists in the newly selected period; otherwise the first available currency is enabled.
- Server-side catalog drift validation remains authoritative.

## Verification

- Unit tests cover fixed and dynamic invoice payloads, one-time and recurrent foreign-currency checkout payloads, period discovery, period selection, and grouped catalog output.
- Type checks, the full test suite, production builds, and a payment-link smoke test run before completion.

