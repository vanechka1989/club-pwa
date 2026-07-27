# Client Error Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal grouped customer-error tracker with a developer inbox and deduplicated PWA push plus email alerts.

**Architecture:** Normalize and sanitize every diagnostic event, atomically upsert a fingerprinted group plus bounded occurrence, then evaluate notification policy independently of ingestion. Expose owner/developer-only APIs and render a compact error center inside the existing server panel while preserving the current server-error fallback.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, Vue 3, Vitest, Playwright, Nodemailer, Web Push.

## Global Constraints

- Do not use Telegram for tracker collection or notification.
- Sanitize before fingerprinting, logging, persistence, push, or email.
- Raw occurrences are retained 14 days, group summaries 90 days after last occurrence, and delivery attempts 30 days.
- New critical groups alert immediately; non-critical groups alert at three occurrences or two affected users within ten minutes; cooldown is 30 minutes unless severity increases.
- Push and email failures must be independent and must never change the originating customer response.
- Real external notifications and real payments are forbidden during automated verification.

---

### Task 1: Domain model, sanitization, and fingerprinting

**Files:**
- Create: `apps/api/src/errorTracker/domain.ts`
- Create: `apps/api/src/errorTracker/domain.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `sanitizeErrorEvent(input)`, `fingerprintErrorEvent(event)`, `classifyErrorSeverity(event)`, `shouldNotifyIncident(input)` and shared tracker response schemas.

- [ ] **Step 1: Write failing domain tests**

```ts
it("redacts secrets and personal data before fingerprinting", () => {
  const event = sanitizeErrorEvent({ source: "client", kind: "window-error", message: "Bearer secret user@example.com", route: "/pay?token=secret" });
  expect(JSON.stringify(event)).not.toContain("secret");
  expect(JSON.stringify(event)).not.toContain("user@example.com");
});

it("keeps one fingerprint for volatile identifiers", () => {
  expect(fingerprintErrorEvent(sanitizeErrorEvent(eventA))).toBe(fingerprintErrorEvent(sanitizeErrorEvent(eventB)));
});
```

- [ ] **Step 2: Run `pnpm --filter @club/api test -- domain.test.ts` and confirm failure because the module does not exist**
- [ ] **Step 3: Implement bounded normalization, recursive redaction, stable SHA-256 fingerprinting, severity rules, and notification thresholds**
- [ ] **Step 4: Add shared Zod schemas for summary, detail, occurrence, delivery, settings, filters, and status updates**
- [ ] **Step 5: Re-run the domain tests and `pnpm --filter @club/shared check`**
- [ ] **Step 6: Commit with `feat: add error tracker domain model`**

### Task 2: Persistent grouped incidents and retention

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0061_error_tracker.sql`
- Create: `apps/api/src/errorTracker/store.ts`
- Create: `apps/api/src/errorTracker/store.test.ts`

**Interfaces:**
- Consumes: sanitized event and fingerprint from Task 1.
- Produces: `recordErrorEvent(event, identity)`, `listErrorGroups(filters)`, `getErrorGroup(id)`, `updateErrorGroupStatus(id, input)`, `getErrorTrackerSummary()`, and `pruneErrorTracker(now)`.

- [ ] **Step 1: Write failing store contract tests for grouping, affected-user uniqueness, resolved-group reopening, and bounded retention**
- [ ] **Step 2: Run the focused store test and confirm the missing store failure**
- [ ] **Step 3: Add `error_groups`, `error_occurrences`, and `error_notification_deliveries` tables with fingerprint/status/time indexes and foreign keys**
- [ ] **Step 4: Implement transactional insert/upsert so concurrent reports cannot lose counters; cap returned occurrences and paginate group queries**
- [ ] **Step 5: Implement batched 14/90/30-day cleanup without recursively reporting cleanup failures**
- [ ] **Step 6: Run store tests and schema/type checks**
- [ ] **Step 7: Commit with `feat: persist grouped error incidents`**

### Task 3: Independent push and email alert delivery

**Files:**
- Create: `apps/api/src/errorTracker/notifications.ts`
- Create: `apps/api/src/errorTracker/notifications.test.ts`
- Create: `apps/api/src/errorTracker/errorAlertEmail.ts`
- Modify: `apps/api/src/push/webPush.ts`
- Modify: `apps/api/src/admin/roles.ts`

**Interfaces:**
- Consumes: recorded group decision from Task 2 and existing Web Push/SMTP configuration.
- Produces: `dispatchErrorNotifications(group)`, `sendWebPushToUsers(userIds, payload)`, and safe text/HTML alert formatting.

- [ ] **Step 1: Write failing tests proving owner/developer recipient resolution, email fallback to owner, disabled blank email, redaction, cooldown, and one-channel failure isolation**
- [ ] **Step 2: Run the focused notification tests and confirm expected failures**
- [ ] **Step 3: Add a multi-user push helper that reuses existing subscription revocation behavior**
- [ ] **Step 4: Implement reusable SMTP transport injection and safe Russian error-alert email formatting**
- [ ] **Step 5: Record per-channel delivery state and bounded retry metadata; never throw back into ingestion**
- [ ] **Step 6: Re-run notification tests**
- [ ] **Step 7: Commit with `feat: alert developers about grouped errors`**

### Task 4: Ingestion and protected administration API

**Files:**
- Modify: `apps/api/src/clientErrors.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/errorTracker/routes.test.ts`
- Modify: `apps/api/src/backgroundJobs.ts`

**Interfaces:**
- Consumes: domain, store, and notification services.
- Produces: `/client-errors` normalized ingestion plus `/admin/error-tracker/summary`, `/groups`, `/groups/:id`, `/groups/:id/status`, and `/settings` endpoints.

- [ ] **Step 1: Write failing route tests for malformed reports, rate limiting, session identity, protected list/detail/settings access, pagination, filters, and audited status changes**
- [ ] **Step 2: Run route tests and confirm missing endpoint/behavior failures**
- [ ] **Step 3: Extend bounded client payload with release, route, stack, display mode, online state, and installation ID while ignoring client-supplied identity/severity**
- [ ] **Step 4: Persist through the tracker and dispatch notifications after successful recording without blocking the request**
- [ ] **Step 5: Add protected admin endpoints using existing observability/owner access and scheduled cleanup in background jobs**
- [ ] **Step 6: Preserve `recordServerError` as fallback while routing uncaught API exceptions into grouped incidents**
- [ ] **Step 7: Run API tests and checks**
- [ ] **Step 8: Commit with `feat: expose error tracker api`**

### Task 5: Complete browser capture context

**Files:**
- Modify: `apps/web/public/boot-diagnostics.js`
- Modify: `apps/web/src/api/startup.ts`
- Modify: `apps/web/src/main.ts`
- Create: `apps/web/src/features/app/errorTrackerCapture.test.ts`

**Interfaces:**
- Produces: bounded reports for boot errors, Vue errors, unhandled rejections, and explicitly reported critical operations.

- [ ] **Step 1: Write failing source/behavior tests for release, sanitized route, PWA display mode, online state, installation ID, Vue error handler, and session deduplication**
- [ ] **Step 2: Run the focused web test and confirm missing context failures**
- [ ] **Step 3: Extend the early boot reporter without adding framework dependencies and install a Vue `errorHandler` after application creation**
- [ ] **Step 4: Ensure reporting uses beacon/fetch keepalive and can never interrupt startup or user actions**
- [ ] **Step 5: Run focused web tests and check**
- [ ] **Step 6: Commit with `feat: capture customer app errors`**

### Task 6: Mobile-first developer error center

**Files:**
- Create: `apps/web/src/features/admin/AdminErrorTracker.vue`
- Create: `apps/web/src/features/admin/adminErrorTracker.test.ts`
- Modify: `apps/web/src/features/admin/AdminServerPanel.vue`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Consumes: shared tracker types and protected APIs.
- Produces: `Центр ошибок` summary, filters, grouped list, detail view, lifecycle actions, delivery history, and notification email setting.

- [ ] **Step 1: Write failing component/source tests for all four counters, status/severity/source filters, group detail, acknowledge/resolve/ignore/restore actions, delivery status, and configurable email**
- [ ] **Step 2: Run focused UI tests and confirm the component is missing**
- [ ] **Step 3: Add typed API client methods and implement compact responsive cards/list with existing theme tokens and safe empty/loading/error states**
- [ ] **Step 4: Integrate the view into the server panel while retaining the legacy raw-error compatibility view**
- [ ] **Step 5: Add accessible labels, keyboard behavior, safe-area spacing, and no horizontal overflow at 320–1440 px**
- [ ] **Step 6: Run focused UI tests and web checks**
- [ ] **Step 7: Commit with `feat: add developer error center`**

### Task 7: End-to-end verification, migration, and production release

**Files:**
- Create: `tests/error-tracker.spec.ts`
- Modify: deployment/migration files only if required by the repository's existing release process.

**Interfaces:**
- Consumes: completed tracker.
- Produces: reproducible synthetic end-to-end proof and deployed schema/application.

- [ ] **Step 1: Write a failing E2E test that submits one synthetic error twice and verifies one group with count two, detail rendering, lifecycle change, and queued test delivery**
- [ ] **Step 2: Run the E2E test and confirm it fails before the completed wiring**
- [ ] **Step 3: Complete only the wiring required for the E2E path and keep external transports stubbed**
- [ ] **Step 4: Run `pnpm check`, `pnpm test`, `pnpm build`, the focused E2E test, and the device regression suite**
- [ ] **Step 5: Review the final diff for secrets, PII, unrelated edits, migration safety, notification loops, and unresolved placeholders**
- [ ] **Step 6: Deploy through the repository's established production workflow, apply migration, and verify health/readiness plus a synthetic non-delivering incident**
- [ ] **Step 7: Commit any final verified release-only adjustments with `test: verify error tracker workflow`**
