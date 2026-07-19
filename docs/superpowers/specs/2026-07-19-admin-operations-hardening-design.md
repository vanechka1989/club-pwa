# Admin operations hardening

## Scope

This change implements audit items 4, 6, 7 and 8:

1. Make payment state and webhook diagnostics explicit.
2. Show integration health and a persistent settings audit trail.
3. Add useful API health metrics and persist server errors across restarts.
4. Reduce `AdminSection.vue` by moving operational screens into focused components.

## Payment diagnostics

Payment orders keep their provider status as the source of truth. The API adds a derived diagnostic state so the UI can distinguish a normal pending checkout from an expired order or a webhook problem without inventing new provider states.

Derived states:

- `paid`: access was granted;
- `awaiting_payment`: checkout was created recently and no payment webhook arrived;
- `expired`: a pending checkout exceeded the payment window;
- `failed`: provider/payment processing failed;
- `cancelled`: checkout was cancelled;
- `webhook_error`: the latest matching webhook is invalid or contradicts the order state.

The response also includes a short human-readable reason and summary counters. This keeps diagnostic rules on the server and prevents different admin screens from interpreting the same order differently.

## Integration health and audit

`GET /admin/integration-health` performs read-only checks and returns a normalized list for PostgreSQL, SMTP, S3, Prodamus and realtime transport. Secrets are never returned. Configuration-only services report `configured` when an active network probe would have side effects; PostgreSQL receives a lightweight `select 1` check.

The existing `admin_action_logs` table remains the persistent source for settings changes. `GET /admin/settings-audit` returns only configuration actions and is rendered next to integration health.

## Monitoring and persistent errors

Server errors move from a process-only array to `server_error_logs`. Recording remains non-blocking: the request path receives an immediate normalized record and persistence happens asynchronously with logging on failure. Admin reads/counts come from PostgreSQL, so restarts no longer erase diagnostics.

Request metrics use a rolling five-minute window and expose requests per minute, 5xx error rate, average and p95 latency. The bounded window prevents lifetime averages from hiding current incidents.

## Frontend decomposition

The payment, project/integration and server screens move to:

- `AdminPaymentsPanel.vue`
- `AdminProjectSettingsPanel.vue`
- `AdminServerPanel.vue`

They receive typed data and callbacks through props/events. `AdminSection.vue` remains the navigation and data orchestration shell during this iteration, avoiding a risky all-at-once rewrite while removing the three operational screens changed here.

## Compatibility

All additions are backward compatible at the database and HTTP level. Existing payment statuses are unchanged. New response fields are additive. The new migration only creates an indexed error-log table.
