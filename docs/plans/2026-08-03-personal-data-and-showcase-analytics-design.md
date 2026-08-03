# Personal Data Access and Showcase Analytics Design

## Goal

Protect client contact data across the entire admin application while allowing the club owner to grant explicit access, and add an isolated showcase mode that demonstrates realistic analytics without changing production data.

## Personal data access

- Add a `personal_data` admin capability labelled `Персональные данные клиентов`.
- The owner always has this capability. A regular administrator receives it only when the owner enables it in the existing permissions screen.
- Treat client email and phone as protected data everywhere in the admin API: client lists and details, statistics, payments, learning engagement, acquisition, mailings, search, and exports.
- Authorization must happen on the server. Responses for an administrator without the capability must not contain raw email or phone values.
- A restricted response exposes only an explicit restriction state needed by the UI. Search by protected fields is disabled for restricted administrators.
- The UI renders a lock-labelled placeholder (`Скрыто владельцем`) instead of placing masked raw values in the DOM.
- Permission changes continue to use the existing owner-only mutation and action-history mechanisms.

## Phone capture

- Add a nullable phone field to the client record with a database migration and shared API contracts.
- Capture phone numbers only from successfully authenticated payment-provider callbacks.
- Prodamus `customer_phone`/`customerPhone` is supported first because the adapter already recognizes these fields. Other provider payloads are captured only when their verified callback schema supplies a phone.
- Normalize whitespace and common separators while preserving a leading `+`. Reject implausible values and never replace a valid stored number with an empty or invalid value.
- Record contact provenance and update time so the client screen can say whether the value came from a payment provider.
- Do not log raw email or phone values in new application logs or audit payloads.

## Client interface

- Add a compact `Контактные данные` area to the client detail screen with email, phone, and source metadata.
- Owners and permitted administrators see and can copy available values.
- Restricted administrators see a lock state with no reveal action.
- Use existing semantic colours and responsive patterns, minimum 44 px touch targets, and verify mobile widths from 320 px upward.

## Showcase analytics

- Add a `Демонстрационные данные` switch to the analytics header for users who already have statistics access.
- Showcase mode is local to the current administrator and device. Persist only the enabled flag and a random seed in local storage.
- Never insert, update, or delete clients, payments, learning events, acquisition events, or mailing records for showcase mode.
- A seeded generator creates a coherent synthetic snapshot for the selected date range. Totals and breakdowns must agree across client, payment, finance, acquisition, and learning views.
- When enabled, show an unmistakable `Демо` status and a `Сгенерировать заново` button. Regeneration changes the seed and refreshes every showcase metric together.
- Turning the switch off immediately restores untouched real analytics.
- Synthetic records use fictional display names and never resemble or reuse real personal data.
- Mailing delivery analytics tied to a real mailing remain real and are not rewritten; the club-level analytics screens receive showcase data.

## Architecture

- Centralize personal-data authorization and redaction in API helpers instead of duplicating checks in Vue components.
- Extend shared schemas so restricted and permitted payloads are explicit and validated.
- Centralize seeded showcase generation in a pure shared web module. Components consume the same generated snapshot, preventing contradictory random values after re-rendering.
- Keep real API requests available in normal mode; showcase mode derives its display snapshot without mutating server state.

## Testing and release

- Add unit tests for the new permission, server-side redaction, protected search, phone normalization/capture, and deterministic showcase generation.
- Add component/source tests for permission controls, lock states, demo switch, demo badge, regeneration, and restoration of real data.
- Run type checking, unit/integration tests, production build, and mobile browser checks.
- Bump the application version, update release history, deploy the exact tested commit, and verify production health, readiness, version, service worker, and the new UI markers.
