# Admin Acquisition Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-party acquisition links, first/last-touch attribution, a conversion and revenue dashboard, and acquisition history in the admin client card.

**Architecture:** Persist tracked links, hashed anonymous visitors, visits, and immutable user attribution in Postgres. Record landing events through a best-effort public endpoint, attach the visitor during email verification, and aggregate visits, registrations, paid clients, and existing paid orders in focused admin APIs. Render the feature in a dedicated Vue admin analytics component and reuse the same acquisition detail contract in the client 360 card.

**Tech Stack:** TypeScript, Hono, Drizzle ORM/PostgreSQL, Zod shared contracts, Vue 3 Composition API, Vitest, CSS/SVG charts, existing PWA `TaskScreen` navigation.

## Global Constraints

- No external analytics service or third-party analytics cookie.
- Store the browser visitor identifier only as an HMAC-SHA256 hash on the server.
- Analytics failures must never block PWA loading, email authentication, referral capture, or payment.
- Preserve `ref` alongside `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and internal `aid`.
- Post-auth destinations are allowlisted internal routes only; no open redirects.
- First-touch and last-touch become immutable after registration.
- Revenue is derived from existing successful `payment_orders`, not copied into analytics tables.
- All new admin screens open inside the PWA and remain usable from 320 px through 1440 px.

---

### Task 1: Shared acquisition contracts and pure helpers

**Files:**
- Create: `packages/shared/src/acquisitionAnalytics.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/acquisition/acquisition.ts`
- Create: `apps/api/src/acquisition/acquisition.test.ts`

**Interfaces:**
- Produces `acquisitionDestinationSchema`, `adminAcquisitionLinkSchema`, `adminAcquisitionDashboardSchema`, `adminUserAcquisitionSchema`, and their inferred types.
- Produces `normalizeAcquisitionLabel(value)`, `normalizeAcquisitionDestination(input)`, `hashAcquisitionVisitorId(visitorId, secret)`, and `isSameAcquisitionWindow(left, right)`.

- [ ] **Step 1: Write failing shared and API tests**

Assert that the shared schemas accept a complete link/dashboard/client-attribution payload, reject invalid `aid` and external destinations, normalize UTM labels, hash visitor IDs deterministically, and treat visits less than 30 minutes apart as one window.

- [ ] **Step 2: Run RED tests**

Run `pnpm --filter @club/shared test -- acquisitionAnalytics.test.ts` and `pnpm --filter @club/api test -- acquisition/acquisition.test.ts`; expect missing exports/modules.

- [ ] **Step 3: Implement contracts and helpers**

Use Zod enums for `home`, `billing`, and `module`; restrict `aid` to lowercase URL-safe characters; return `null` for empty optional UTM content; use `createHmac("sha256", secret)` with domain prefix `acquisition-visitor:v1`.

- [ ] **Step 4: Run GREEN tests and commit**

Run the two targeted test commands; expect PASS. Commit `feat(analytics): add acquisition contracts`.

### Task 2: Postgres persistence and attribution writer

**Files:**
- Create: `apps/api/drizzle/0051_acquisition_analytics.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/acquisition/acquisitionStore.ts`
- Create: `apps/api/src/acquisition/acquisitionStore.test.ts`

**Interfaces:**
- Consumes helper normalization and visitor hashing from Task 1.
- Produces `recordAcquisitionVisit({ aid, visitorId, occurredAt? })`, `attachAcquisitionToUser({ visitorId, userId, registeredAt? })`, `createAcquisitionLink(input, actorUserId)`, and `setAcquisitionLinkActive(id, isActive)`.

- [ ] **Step 1: Write the migration/schema test**

Require `acquisition_links`, `acquisition_visitors`, `acquisition_visits`, and `user_acquisition_attributions`, foreign keys, the public `aid` unique index, visitor hash unique index, visit time indexes, and user-attribution unique index.

- [ ] **Step 2: Run the API test and confirm RED**

Run `pnpm --filter @club/api test -- acquisition/acquisitionStore.test.ts`; expect the missing tables/store failure.

- [ ] **Step 3: Add schema, SQL migration, journal entry, and store**

Make link deletion non-destructive by using an active flag. Upsert visitors by hash, deduplicate visitor/link visits within 30 minutes, and attach the earliest and latest pre-registration visits once with `onConflictDoNothing` for the user attribution row.

- [ ] **Step 4: Run GREEN tests and commit**

Run the targeted API test and schema/deploy tests; expect PASS. Commit `feat(analytics): persist acquisition attribution`.

### Task 3: Public landing tracking and email-registration attachment

**Files:**
- Create: `apps/api/src/routes/acquisition.ts`
- Create: `apps/api/src/acquisition/acquisitionRoute.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/auth/emailAuth.test.ts`
- Modify: `apps/web/src/features/auth/AuthSection.vue`
- Modify: `apps/web/src/App.vue`
- Create: `apps/web/src/features/app/acquisitionTracking.ts`
- Create: `apps/web/src/features/app/acquisitionTracking.test.ts`
- Modify: `apps/web/src/stores/session.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Public `POST /analytics/acquisition/visit` accepts `{ aid, visitorId }` and returns `{ accepted, destination }`.
- Email start/verify payloads accept optional `acquisitionVisitorId` while preserving `referralCode`.
- Web helper produces `captureAcquisitionLanding(location)`, `getAcquisitionVisitorId()`, and `consumePostAuthDestination()`.

- [ ] **Step 1: Write failing route, auth, and browser-helper tests**

Cover active, disabled, and unknown links; rate limiting; safe destination output; UTM/ref preservation; stable first-party visitor ID; session persistence; and best-effort failures.

- [ ] **Step 2: Run RED tests**

Run focused API and web tests; expect missing route/helper and payload fields.

- [ ] **Step 3: Implement public capture and auth attachment**

Mount the public route, start capture from the root app so anonymous and already authenticated visits are counted without delaying rendering, send the visitor ID through start/verify, call `attachAcquisitionToUser` after `findOrCreateEmailUser`, and preserve the allowlisted destination until authenticated navigation completes.

- [ ] **Step 4: Run GREEN tests and commit**

Run the focused suites; expect PASS. Commit `feat(analytics): capture acquisition landings`.

### Task 4: Admin analytics aggregation and link-management API

**Files:**
- Create: `apps/api/src/acquisition/acquisitionAnalytics.ts`
- Create: `apps/api/src/acquisition/acquisitionAnalytics.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/acquisition/acquisitionAdminRoute.test.ts`
- Modify: `apps/api/src/admin/actionLog.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- `getAcquisitionDashboard({ from, to, attribution })` returns KPI, funnel, timeline, revenue timeline, sources, campaigns, and top links.
- `getUserAcquisition(userId)` returns first-touch, last-touch, milestones, payment totals, and visit history.
- Admin routes: `GET/POST /admin/acquisition/links`, `PATCH /admin/acquisition/links/:id`, `GET /admin/acquisition/dashboard`, and `GET /admin/users/:telegramId/acquisition`.

- [ ] **Step 1: Write failing aggregation and endpoint tests**

Use fixtures containing repeated visits, two campaigns, registrations, first payments, later paid orders, and unattributed users. Assert period semantics, first/last-touch grouping, conversion percentages, immutable history, permissions, validation, and audit-log events.

- [ ] **Step 2: Run RED tests**

Run `pnpm --filter @club/api test -- acquisition/acquisitionAnalytics.test.ts acquisition/acquisitionAdminRoute.test.ts`; expect missing implementations.

- [ ] **Step 3: Implement server-side aggregation and routes**

Aggregate bounded daily points in SQL/TypeScript, count distinct visitor hashes, derive paid facts from `payment_orders`, return no raw IP/User-Agent, and reuse the existing `statistics` permission.

- [ ] **Step 4: Run GREEN tests and commit**

Run focused API, permission, and action-log tests; expect PASS. Commit `feat(analytics): expose acquisition dashboard`.

### Task 5: Admin dashboard, SVG charts, and link generator

**Files:**
- Create: `apps/web/src/features/admin/AdminAcquisitionAnalytics.vue`
- Create: `apps/web/src/features/admin/AcquisitionLineChart.vue`
- Create: `apps/web/src/features/admin/adminAcquisitionAnalytics.ts`
- Create: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminPanels.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes Task 4 client methods and shared contracts.
- Emits no external navigation; uses internal state/`TaskScreen` for dashboard and links.
- Produces accessible chart labels and a tabular fallback summary.

- [ ] **Step 1: Write failing UI tests**

Require the renamed «Аналитика» panel, period and attribution controls, KPI cards, funnel, two SVG charts, source/campaign/top-link sections, generator fields, copy action, active toggle, loading/empty/error states, and no `target="_blank"`.

- [ ] **Step 2: Run RED web tests**

Run `pnpm --filter @club/web test -- adminAcquisitionAnalytics.test.ts adminStatisticsNavigation.test.ts`; expect missing components/copy.

- [ ] **Step 3: Implement the responsive analytics UI**

Keep existing club-statistics navigation below the acquisition overview, load dashboard and links on demand, normalize generated URLs through server responses, and make charts responsive at 320–1440 px with 44 px controls and no horizontal scrolling.

- [ ] **Step 4: Run GREEN tests and commit**

Run focused web tests; expect PASS. Commit `feat(admin): add acquisition analytics dashboard`.

### Task 6: Acquisition block in client 360

**Files:**
- Create: `apps/web/src/features/admin/AdminClientAcquisition.vue`
- Create: `apps/web/src/features/admin/adminClientAcquisition.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminClientCard.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes `getAdminUserAcquisition(telegramId)` and `AdminUserAcquisition`.
- Emits `open-link` and `open-campaign` to navigate inside the admin analytics panel with a filter.

- [ ] **Step 1: Write failing client-card tests**

Require combined identical first/last touch, separate first/last cards, complete UTM fields, milestone timings, payment count/revenue, collapsible visit history, legacy empty state, and internal analytics navigation.

- [ ] **Step 2: Run RED web tests**

Run `pnpm --filter @club/web test -- adminClientAcquisition.test.ts adminClientCard.test.ts`; expect the missing block.

- [ ] **Step 3: Implement lazy-loaded client attribution**

Load acquisition only when a client card opens, preserve the current card when loading fails, display immutable facts, and route link/campaign taps to the analytics panel without a new browser tab.

- [ ] **Step 4: Run GREEN tests and commit**

Run the focused client-card and admin navigation tests; expect PASS. Commit `feat(admin): show client acquisition history`.

### Task 7: Release, full verification, and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Publishes the next patch version and increments the service-worker cache.

- [ ] **Step 1: Add failing release tests**

Require the next patch version, Russian/English acquisition-analytics release title, previous 5.33 history, and the next service-worker cache name.

- [ ] **Step 2: Update version, notes, and cache**

Describe the new analytics, tracked links, funnel, and client-card attribution without claiming historical data exists for legacy users.

- [ ] **Step 3: Verify locally**

Run focused tests, `pnpm test`, `pnpm build`, `git diff --check`, and the PWA visual audit at 320×720, 390×844, 768×1024, 1024×768, and 1440×900. Confirm no horizontal overflow, inaccessible chart data, or console errors.

- [ ] **Step 4: Commit, push, deploy, and verify production**

Push `main`, wait for `/opt/club-pwa/deploy/status.sh --summary` to report the exact commit as `success`, then verify site 200, `/api/health` 200, applied migration 0051, new API authorization, PWA cache/version, production assets, and server logs. Commit `release: publish acquisition analytics`.
