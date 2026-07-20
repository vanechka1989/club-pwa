# Mailing Engagement Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable Push and Email engagement analytics for new mailings, including unique opens, unique link clicks, channel breakdowns, timeline data, and recipient status drill-down.

**Architecture:** Public tracking endpoints validate domain-separated HMAC tokens and insert idempotent event rows. Email HTML and Web Push URLs are instrumented per delivery recipient, while in-app notification reads feed the same event writer. Admin endpoints aggregate facts from recipient and event rows and the existing mailing detail screen renders the report on demand.

**Tech Stack:** TypeScript, Hono, Drizzle ORM/PostgreSQL, Vue 3, Pinia client utilities, Zod shared schemas, Vitest.

## Global Constraints

- Tracking applies only to mailings whose `analytics_enabled_at` is non-null.
- Store no IP address, User-Agent, cookie, or device fingerprint.
- Email opens are labelled approximate in the UI.
- Opens and clicks are unique per recipient; a click is additionally unique per destination URL.
- Tracking failures never change delivery state or prevent a valid click redirect.
- Reuse `MAILING_UNSUBSCRIBE_SECRET` with the domain prefix `mailing-tracking:v1`.
- Redirect only to signed HTTP or HTTPS destinations.
- Release application 5.26 with Service Worker cache `club-pwa-v216`.

---

### Task 1: Signed tracking tokens

**Files:**
- Create: `apps/api/src/mailings/trackingToken.ts`
- Test: `apps/api/src/mailings/trackingToken.test.ts`

**Interfaces:**
- Produces: `createMailingTrackingToken(payload, explicitSecret?)`, `verifyMailingTrackingToken(token, explicitSecret?)`.
- Payload union: `{ purpose: "open" | "push"; recipientId: string } | { purpose: "click"; recipientId: string; destination: string }`.

- [ ] Write tests proving round-trip for all purposes, tamper rejection, purpose preservation, and rejection of non-HTTP click destinations.
- [ ] Run `pnpm --filter @club/api test -- src/mailings/trackingToken.test.ts` and confirm the missing-module failure.
- [ ] Implement compact Base64URL payload plus HMAC-SHA256 signature using `timingSafeEqual` and the configured mailing secret.
- [ ] Run the targeted test and confirm it passes.
- [ ] Commit with `feat(mailings): add signed analytics tokens`.

### Task 2: Analytics persistence and idempotent event writer

**Files:**
- Create: `apps/api/drizzle/0050_mailing_engagement_analytics.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/mailings/trackingEvents.ts`
- Test: `apps/api/src/mailings/trackingEvents.test.ts`

**Interfaces:**
- Produces: `recordMailingTrackingEvent({ recipientId, purpose, destination?, occurredAt? })` and `getMailingEventKey(purpose, destination?)`.
- The writer resolves `mailingId` from the recipient and inserts with `onConflictDoNothing`.

- [ ] Write a failing migration/schema test that requires `analyticsEnabledAt`, the event table, indexes, journal entry 0050, and a deterministic SHA-256 click key.
- [ ] Run the targeted test and confirm failure because migration/schema/event writer are missing.
- [ ] Add the migration, journal entry, Drizzle schema, relations, and event-key helper.
- [ ] Implement the idempotent insert writer without reading or storing request metadata.
- [ ] Run the targeted test and API typecheck.
- [ ] Commit with `feat(mailings): persist engagement events`.

### Task 3: Email and Push instrumentation

**Files:**
- Create: `apps/api/src/mailings/trackingHtml.ts`
- Test: `apps/api/src/mailings/trackingHtml.test.ts`
- Modify: `apps/api/src/routes/mailings.ts`
- Modify: `apps/api/src/notifications/create.ts`
- Modify: `apps/api/src/push/webPush.test.ts`

**Interfaces:**
- Produces: `instrumentMailingEmailHtml({ html, recipientId, attachmentUrl? }): { html: string; trackedAttachmentUrl: string | null }`.
- `createAppNotification` gains optional `pushUrl?: string` and passes it to Web Push.

- [ ] Write failing tests for rewriting safe HTTP/HTTPS anchors, preserving mailto/unsubscribe links, adding one pixel, tracking an attachment, and assigning a signed Push URL.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement HTML instrumentation after sanitization and use it only when `analyticsEnabledAt` is set.
- [ ] Pass the actual claimed recipient to the delivery sender, add the Push tracking redirect URL, and preserve test-mailing behavior without analytics.
- [ ] Run all mailing and web-push tests plus API typecheck.
- [ ] Commit with `feat(mailings): instrument email and push engagement`.

### Task 4: Public tracking endpoints and in-app opens

**Files:**
- Create: `apps/api/src/routes/mailingTracking.ts`
- Test: `apps/api/src/mailings/trackingRoute.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/notifications.ts`
- Test: `apps/api/src/mailings/notificationTracking.test.ts`

**Interfaces:**
- Routes: `GET /mailings/track/open`, `GET /mailings/track/click`, `GET /mailings/track/push`.
- Produces helper `recordUnreadMailingNotificationsOpened(userId, notificationIds?)` used before setting `readAt`.

- [ ] Write failing source/behavior tests for invalid-token 404, transparent GIF response, no-store headers, safe 302 redirect, push redirect to `/notifications`, and notification-read event recording before mutation.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement the public route; catch and log event-write failures only after a valid token.
- [ ] Mount it under `/mailings/track` before admin middleware.
- [ ] Record unread `source = mailing` notifications from both bulk and individual read endpoints.
- [ ] Run focused tests and API typecheck.
- [ ] Commit with `feat(mailings): collect engagement events`.

### Task 5: Analytics aggregation and recipient drill-down API

**Files:**
- Create: `apps/api/src/mailings/analytics.ts`
- Test: `apps/api/src/mailings/analytics.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/mailings.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/api/src/mailings/analyticsEndpoint.test.ts`

**Interfaces:**
- Produces `getMailingAnalytics(mailingId)` and `getMailingAnalyticsRecipients(mailingId, filters)`.
- Shared schemas/types: `AdminMailingAnalytics`, `AdminMailingAnalyticsRecipient`, and paginated response.
- Client functions: `getAdminMailingAnalytics(id)` and `getAdminMailingAnalyticsRecipients(id, query)`.

- [ ] Write failing pure aggregation tests for unique users, per-link uniqueness, rate zero denominators, per-channel breakdown, and time buckets.
- [ ] Write failing endpoint/schema tests for permissions, UUID validation, old-mailing tracking state, filters, 50-row limit, and cursor.
- [ ] Run tests and confirm failures.
- [ ] Implement aggregation from recipient/event facts, safe error presentation, filtering, stable cursor pagination, Zod schemas, routes, and client functions.
- [ ] Set `analyticsEnabledAt` when a real mailing is created; keep test drafts untracked.
- [ ] Run shared/API/client tests and typechecks.
- [ ] Commit with `feat(mailings): expose engagement analytics`.

### Task 6: Admin analytics interface

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/interfaceLocalization.ts`
- Test: `apps/web/src/features/admin/adminMailingAnalytics.test.ts`

**Interfaces:**
- Loads analytics only when mailing detail opens.
- Recipient filters: status `all|delivered|opened|clicked|failed|skipped|pending`, channel `all|push|email`.

- [ ] Write failing UI source tests requiring KPI labels, approximate-email note, channel cards, timeline, links, recipient filters, loading/empty/error states, and responsive CSS contracts.
- [ ] Run the targeted test and confirm failure.
- [ ] Implement analytics state, on-demand loading, KPI/channel/timeline/link sections, recipient filter/pagination controls, and old-mailing explanation.
- [ ] Add English localization and mobile-first styles with wrapped KPIs and 44px controls.
- [ ] Run admin, localization, and full web tests plus web build.
- [ ] Commit with `feat(mailings): add engagement analytics dashboard`.

### Task 7: Release, verification, and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

- [ ] Write/update failing release tests for version 5.26, analytics release notes, and cache v216.
- [ ] Run release tests and confirm failure.
- [ ] Update version, release notes, and Service Worker cache.
- [ ] Run `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] Perform the PWA visual audit at all five required viewport sizes.
- [ ] Commit with `release: publish mailing engagement analytics`.
- [ ] Merge to `main`, rerun verification, push, wait for deployment, verify migration 0050/indexes, health, public invalid-token behavior, version/cache, and API logs.

