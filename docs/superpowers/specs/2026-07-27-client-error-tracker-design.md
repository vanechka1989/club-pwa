# Client Error Tracker Design

## Goal

Build an internal error tracker for Club PWA that detects failures affecting customers, groups repeated occurrences, gives the owner and developer a practical error inbox, and sends actionable alerts through PWA push and email. The tracker must not depend on Telegram or expose secrets and customer content.

## Chosen Approach

Extend the application's existing client diagnostics, persisted server-error log, PWA push subscriptions, SMTP delivery, and owner/developer access controls. This keeps operational data inside the Club PWA deployment and avoids a new paid third-party dependency.

The alternatives considered were an external error platform such as Sentry and direct email for every error. An external platform offers mature source-map tooling but adds cost, configuration, and third-party data processing. Sending every error directly by email is simpler but creates duplicate noise and has no incident lifecycle. The internal grouped tracker is the selected approach; an external integration can be added later without changing its public event model.

## Scope

The first release covers:

- uncaught browser errors, unhandled promise rejections, blank-screen startup failures, and explicitly reported critical client operations;
- uncaught API errors and selected server-side operational failures;
- grouping, severity, occurrence counters, affected-user counters, and release/route/device context;
- owner/developer-only list and detail screens with incident statuses;
- deduplicated PWA push and email notifications;
- retention, sanitization, rate limiting, and delivery diagnostics.

Infrastructure uptime, host resource monitoring, and external availability checks remain in the existing operational monitoring system. Expected business outcomes such as declined payments, invalid login codes, validation errors, and ordinary 4xx responses are not incidents unless a dedicated rule marks an abnormal spike or provider failure.

## Event Contract

All sources are normalized into one safe event envelope before persistence:

- source: `client`, `api`, `background-job`, or `payment-webhook`;
- kind and normalized message;
- severity: `warning`, `error`, or `critical`;
- route and HTTP method/status when applicable;
- application release identifier;
- safe stack trace or diagnostic detail;
- browser, operating system, viewport, PWA display mode, and online state when available;
- authenticated user ID and installation ID resolved or verified by the server when available;
- request/correlation ID when available;
- occurrence time.

The browser payload remains bounded. The server never trusts a client-supplied user identity or severity without validation. Anonymous boot failures are accepted through the existing rate-limited endpoint; authenticated reports are associated with the current session when available.

## Privacy and Sanitization

Sanitization runs before fingerprinting, logging, persistence, or notification delivery. It removes or masks:

- authorization headers, cookies, session tokens, API keys, webhook signatures, and passwords;
- URL query strings and fragments;
- form bodies, chat/support message content, payment payloads, and uploaded-file contents;
- email addresses and other incidental personal data inside messages or stacks;
- excessive stack frames and oversized diagnostic objects.

The tracker stores internal user and installation identifiers only to calculate impact. The interface shows a minimal authorized identity where useful and never includes raw customer content in push or email. Ingestion failure must never break the user flow that produced the diagnostic event.

## Grouping and Incident Lifecycle

Each event receives a stable fingerprint derived from its source, normalized exception name/message, top relevant stack frame, route, and release-independent code location. Volatile identifiers, numbers, URLs, and user-specific values are removed before hashing.

The data model separates groups from occurrences:

- an error group stores fingerprint, title, source, severity, status, first/last seen times, total count, affected-user/device counts, current and first affected releases, latest safe sample, notification cooldown state, and resolution metadata;
- an occurrence stores the group reference, safe context, time, internal user/installation references, request ID, and release.

Statuses are `new`, `acknowledged`, `resolved`, and `ignored`. A resolved group that occurs again is reopened automatically. An ignored group continues counting occurrences but does not send alerts until restored. Repeated occurrences update one group rather than creating duplicate list entries.

Client-side duplicate suppression prevents the same page session from reporting the same fingerprint repeatedly. Server-side per-IP/per-user rate limits and per-fingerprint cooldowns provide the authoritative abuse and noise control.

## Severity and Notification Rules

Critical events include application startup failure, authentication or payment flow crashes, data-loss-risk operations, uncaught server exceptions on sensitive routes, and configured occurrence spikes. Ordinary uncaught failures are errors; recoverable diagnostics are warnings.

Notifications follow these rules:

- a new critical group alerts immediately;
- a non-critical group alerts after either three occurrences or two affected users within ten minutes;
- a sharp increase in an existing group can send one escalation alert;
- the same group cannot alert again during a 30-minute cooldown unless its severity increases;
- repeated events during cooldown are summarized by updated counters rather than delivered separately;
- resolving or ignoring a group does not email customers and does not create a public notification.

Thresholds are centralized constants so they can later become owner settings without changing event processing.

## Push and Email Delivery

PWA push is sent to active push subscriptions belonging to the owner and users with developer/observability access. The notification contains a short safe title, severity, occurrence/affected-user count, and a deep link to the error group in the developer area.

Email is a parallel fallback channel. The recipient is configurable in developer/server settings and defaults to the current owner email. An empty optional address disables error email without affecting push or collection. Delivery uses the existing SMTP configuration and a reusable mail service rather than the current command-line-only operational sender.

The email subject clearly identifies Club PWA and the incident severity. The body contains the safe diagnostic summary, source, release, route, first/last seen time, impact counters, and a link to the internal detail screen. Raw request bodies, credentials, customer messages, and full personal data are forbidden.

Push and email are dispatched independently after the event is persisted. Failure of one channel does not block the other or the originating API request. Delivery attempts record channel, state, attempt count, last error category, and timestamps. Transient failures are retried with bounded backoff; invalid push subscriptions are revoked by the existing push service.

## Developer Interface

The current server diagnostics area gains a dedicated `Центр ошибок` view available only to the owner and authorized developer/observability roles.

The overview contains compact counters for new critical groups, active groups, affected users, and occurrences during the last 24 hours. The grouped list is ordered by severity and recency and can be filtered by status, severity, source, route, and release. Each row shows the incident title, status, latest occurrence, total count, affected-user count, route, and release without exposing raw content.

The detail view contains:

- safe exception and stack sample;
- first/last seen time and occurrence timeline;
- affected releases, routes, devices, operating systems, and anonymized/internal user references;
- request IDs for matching structured server logs;
- push/email delivery history;
- actions to acknowledge, resolve, ignore, restore, and temporarily mute notifications.

The existing simple server-error panel remains usable during migration. Once all current sources feed the grouped tracker, it becomes a compact link or compatibility view rather than a second competing error inbox.

## API and Access Control

The anonymous/authenticated ingestion endpoint accepts only the bounded normalized payload and returns a generic success response. List, detail, status changes, notification settings, and delivery history require owner or explicit observability/developer permission.

The API provides paginated group and occurrence queries, aggregate counters, status updates with optimistic concurrency, and notification-setting reads/updates. State-changing actions are included in the existing admin action audit log. Error details are never returned through client-facing app-state endpoints.

## Retention and Cleanup

Raw occurrences are retained for 14 days. Group summaries and their latest sanitized sample are retained for 90 days after the last occurrence, except active groups. Delivery attempts are retained for 30 days. A bounded scheduled cleanup deletes expired rows in batches and records failures through ordinary structured logs without recursively creating tracker incidents.

The tracker enforces database indexes for fingerprint/status/last-seen queries and time-based cleanup. Occurrence insertion and group counters are updated atomically to avoid lost counts under concurrent reports.

## Failure Handling

- If the database is temporarily unavailable, the existing bounded in-memory server-error fallback and structured application log remain available.
- Tracker persistence, grouping, or notification failures never replace the original application response.
- The tracker excludes its own notification-delivery errors from immediate re-alerting to prevent loops; these appear as delivery diagnostics and can contribute to a single operational alert.
- Malformed or oversized client reports are rejected without storing their contents.
- Missing SMTP or Web Push configuration marks that channel as unavailable while leaving collection and the other channel operational.

## Testing and Verification

Unit tests cover payload validation, sanitization, fingerprint stability, grouping, atomic counters, severity rules, reopen behavior, cooldowns, retention, and notification redaction. API tests cover anonymous and authenticated ingestion, rate limiting, owner/developer authorization, pagination, filters, status transitions, and settings validation.

Push and email tests use test transports and assert independent delivery, retry classification, deep links, recipient fallback, disabled email behavior, and absence of secrets or customer content. UI tests cover compact mobile layouts, filters, status actions, empty/loading/error states, and accessibility.

An end-to-end synthetic failure verifies the full path from browser capture to one grouped incident, incremented duplicate counts, the developer detail screen, and queued push/email delivery. Production verification uses a clearly marked synthetic event and does not trigger a real payment or expose real customer data.

## Success Criteria

The feature is complete when:

1. A customer-facing uncaught error appears as a sanitized grouped incident with release, route, device, and impact counters.
2. Repeated identical errors increase one group's counters without producing notification spam.
3. A qualifying incident sends PWA push and email to configured developer recipients, with either channel allowed to fail independently.
4. The owner/developer can acknowledge, resolve, ignore, restore, filter, and inspect incidents from a mobile-friendly internal screen.
5. Reappearance of a resolved incident reopens it and follows the notification cooldown rules.
6. Credentials, payment bodies, authentication data, customer messages, and raw personal data never enter stored diagnostics or alerts.
7. Automated tests and a synthetic end-to-end check verify collection, grouping, access control, UI behavior, and delivery without making a real payment.
