# Reliable Mailing Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded automatic retries, stale-delivery recovery, exact aggregate counters, and an admin action that retries only failed mailing deliveries.

**Architecture:** Keep the existing PostgreSQL-backed queue and extend each recipient row with retry metadata. Put retry classification and timing in a small pure module, keep database transitions in the mailing route, and derive mailing counters from recipient rows so restarts and manual retries cannot inflate totals.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Vue 3, Zod, Vitest.

## Global Constraints

- Use at most three attempts in one automatic delivery cycle.
- Retry temporary failures after 1 minute and then 5 minutes.
- Recover `processing` rows only after ten minutes without an update.
- Never reset or resend `sent` and skipped recipient rows.
- Preserve the unique `(mailingId, userId, channel)` delivery constraint.
- Do not add Redis or another queue dependency.

---

### Task 1: Retry Policy

**Files:**
- Create: `apps/api/src/mailings/deliveryReliability.ts`
- Test: `apps/api/src/mailings/deliveryReliability.test.ts`

**Interfaces:**
- Produces: `classifyMailingDeliveryError(error: unknown): "temporary" | "permanent"`
- Produces: `getMailingRetryDecision(attemptCount: number, error: unknown, now?: Date): { status: "pending" | "failed"; nextAttemptAt: Date | null; error: string }`
- Produces: `getStaleMailingProcessingCutoff(now?: Date): Date`

- [ ] **Step 1: Write failing retry-policy tests**

```ts
expect(getMailingRetryDecision(1, new Error("ETIMEDOUT"), now)).toEqual({
  status: "pending",
  nextAttemptAt: new Date("2026-07-20T10:01:00.000Z"),
  error: "Временная ошибка доставки"
});
expect(getMailingRetryDecision(2, new Error("429 Too Many Requests"), now).nextAttemptAt)
  .toEqual(new Date("2026-07-20T10:05:00.000Z"));
expect(getMailingRetryDecision(3, new Error("ECONNRESET"), now).status).toBe("failed");
expect(getMailingRetryDecision(1, new Error("Invalid recipient"), now).status).toBe("failed");
expect(getStaleMailingProcessingCutoff(now)).toEqual(new Date("2026-07-20T09:50:00.000Z"));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @club/api test -- deliveryReliability.test.ts`
Expected: FAIL because `deliveryReliability.ts` does not exist.

- [ ] **Step 3: Implement the pure policy**

Normalize stored errors to fixed Russian messages without provider payloads. Recognize timeouts, connection errors, rate limits, and HTTP 5xx as temporary; classify known invalid/missing/blocked/unsubscribed recipient failures as permanent; default unknown delivery errors to temporary so a transient provider failure is not discarded after one attempt.

- [ ] **Step 4: Run the policy tests and verify GREEN**

Run: `pnpm --filter @club/api test -- deliveryReliability.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mailings/deliveryReliability.ts apps/api/src/mailings/deliveryReliability.test.ts
git commit -m "feat(mailings): add bounded delivery retry policy"
```

### Task 2: Persist Retry State

**Files:**
- Create: `apps/api/drizzle/0049_mailing_delivery_retries.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/mailings/pushEmailQueue.test.ts`

**Interfaces:**
- Produces recipient fields `attemptCount: number`, `nextAttemptAt: Date | null`, and `lastAttemptAt: Date | null`.

- [ ] **Step 1: Add a failing schema/migration contract test**

Require the schema fields and a migration containing:

```sql
ALTER TABLE "admin_mailing_recipients" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "admin_mailing_recipients" ADD COLUMN "next_attempt_at" timestamp with time zone;
ALTER TABLE "admin_mailing_recipients" ADD COLUMN "last_attempt_at" timestamp with time zone;
CREATE INDEX "admin_mailing_recipients_retry_idx"
  ON "admin_mailing_recipients" ("status", "next_attempt_at", "updated_at");
```

- [ ] **Step 2: Run the queue contract test and verify RED**

Run: `pnpm --filter @club/api test -- pushEmailQueue.test.ts`
Expected: FAIL because migration `0049_mailing_delivery_retries.sql` and fields are missing.

- [ ] **Step 3: Add the migration and matching Drizzle fields/index**

Use `integer` for `attemptCount` and timezone-aware timestamps for both dates. Do not modify the existing unique delivery index.

- [ ] **Step 4: Run the queue contract test and verify GREEN**

Run: `pnpm --filter @club/api test -- pushEmailQueue.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/drizzle/0049_mailing_delivery_retries.sql apps/api/src/db/schema.ts apps/api/src/mailings/pushEmailQueue.test.ts
git commit -m "feat(mailings): persist delivery retry state"
```

### Task 3: Make Queue Processing Recoverable

**Files:**
- Modify: `apps/api/src/routes/mailings.ts`
- Modify: `apps/api/src/mailings/pushEmailQueue.test.ts`
- Test: `apps/api/src/mailings/deliveryReliability.test.ts`

**Interfaces:**
- Consumes retry policy from Task 1 and retry columns from Task 2.
- Produces `recalculateMailingDeliveryState(mailingId: string, now?: Date): Promise<void>` inside the route module.

- [ ] **Step 1: Write failing queue behavior contracts**

Require source behavior for:

```ts
lte(adminMailingRecipients.nextAttemptAt, now)
lt(adminMailingRecipients.updatedAt, getStaleMailingProcessingCutoff(now))
attemptCount: sql`${adminMailingRecipients.attemptCount} + 1`
```

Also require aggregate queries using filtered `count()` expressions for `sent`, `failed`, and skipped statuses, followed by direct `.set({ sentCount, failedCount, skippedCount })`; remove incremental counter SQL.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @club/api test -- pushEmailQueue.test.ts deliveryReliability.test.ts`
Expected: FAIL on absent recovery, retry scheduling, and exact-counter behavior.

- [ ] **Step 3: Recover stale processing rows before claiming work**

Update only rows whose status is `processing` and `updatedAt` is older than the ten-minute cutoff. Set them to `pending`, preserve `attemptCount`, clear `nextAttemptAt`, and update `updatedAt`.

- [ ] **Step 4: Claim only due pending rows and record the attempt atomically**

Treat `nextAttemptAt IS NULL OR nextAttemptAt <= now` as due. The claim changes `pending` to `processing`, increments `attemptCount`, sets `lastAttemptAt` and `updatedAt`, and returns both `id` and the new attempt count.

- [ ] **Step 5: Apply retry decisions on failures**

Keep `EmailDailyLimitError` as a mailing-level deferral without consuming a failed result. For other exceptions, call `getMailingRetryDecision`; either return the row to `pending` with `nextAttemptAt`, or set it to `failed` with `nextAttemptAt: null`.

- [ ] **Step 6: Recalculate counters and completion from recipient rows**

After each batch, query actual recipient statuses. Keep a mailing `running` while due/future `pending` or fresh `processing` rows exist, set `completed` only when none remain, and store exact counters rather than increments.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/api test -- pushEmailQueue.test.ts deliveryReliability.test.ts`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/mailings.ts apps/api/src/mailings/pushEmailQueue.test.ts apps/api/src/mailings/deliveryReliability.test.ts
git commit -m "feat(mailings): recover and retry failed deliveries"
```

### Task 4: Retry Failed Deliveries Through the API

**Files:**
- Modify: `apps/api/src/routes/mailings.ts`
- Create: `apps/api/src/mailings/retryFailedEndpoint.test.ts`
- Modify: `apps/api/src/mailings/serialize.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `POST /admin/mailings/:id/retry-failed`
- Adds `pendingCount` and `processingCount` to `AdminMailing`.

- [ ] **Step 1: Write failing endpoint and serialization contracts**

Require the endpoint to update only rows matching `mailingId` and `status = "failed"`, resetting:

```ts
{
  status: "pending",
  attemptCount: 0,
  nextAttemptAt: null,
  lastAttemptAt: null,
  error: null,
  updatedAt: now
}
```

Require an audit action `mailing.failed.retry` and response fields `pendingCount` and `processingCount`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @club/api test -- retryFailedEndpoint.test.ts`
Expected: FAIL because the endpoint does not exist.

- [ ] **Step 3: Implement the endpoint and exact state refresh**

Reject invalid IDs, return 404 for a missing mailing, return 409 when no failed rows exist, reset only failed rows, set the mailing to `running`, clear `completedAt`, recalculate counters, record the audit event, and return the serialized mailing.

- [ ] **Step 4: Extend shared schema and serializer**

Add nonnegative integer `pendingCount` and `processingCount` fields and populate them from recipient-status counts. Keep existing response compatibility by changing both shared schema and API serializer in the same commit.

- [ ] **Step 5: Run API and shared tests and verify GREEN**

Run: `pnpm --filter @club/api test -- retryFailedEndpoint.test.ts && pnpm --filter @club/shared test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/mailings.ts apps/api/src/mailings/retryFailedEndpoint.test.ts apps/api/src/mailings/serialize.ts packages/shared/src/index.ts
git commit -m "feat(mailings): add failed-delivery retry action"
```

### Task 5: Admin Reliability Controls

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminMailings.test.ts`
- Modify: `apps/web/src/features/app/interfaceLocalization.ts`

**Interfaces:**
- Consumes: `POST /admin/mailings/:id/retry-failed` and new mailing counters.
- Produces: `retryFailedAdminMailing(id: string): Promise<AdminMailingMutationResponse>`.

- [ ] **Step 1: Write failing UI contracts**

Require:

- existing template-copy action text becomes `Использовать снова`;
- `Повторить ошибки` appears only when `mailing.failedCount > 0` and the mailing is not running;
- the button calls `retryFailedAdminMailing(mailing.id)`;
- cards/details show delivered, pending, processing, skipped, and failed counts;
- the action reports success through the existing admin notice mechanism.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `pnpm --filter @club/web test -- adminMailings.test.ts`
Expected: FAIL because the client method and controls are absent.

- [ ] **Step 3: Add the API client method and component handler**

On success replace the corresponding mailing in `mailings`, refresh `selectedMailing` when open, and show `Ошибочные доставки возвращены в очередь.` On failure use the existing request-error presentation.

- [ ] **Step 4: Add counters and distinguish the two repeat actions**

Keep the existing editor-copy behavior under `Использовать снова`. Add `Повторить ошибки` next to delivery controls only for eligible mailings, including the failed recipient count in its accessible label.

- [ ] **Step 5: Add English localization entries and run tests**

Run: `pnpm --filter @club/web test -- adminMailings.test.ts interfaceLocalization.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/features/admin/AdminSection.vue apps/web/src/features/admin/adminMailings.test.ts apps/web/src/features/app/interfaceLocalization.ts
git commit -m "feat(mailings): expose delivery recovery controls"
```

### Task 6: Release and Production Verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces release `5.25` and service-worker cache `club-pwa-v215`.

- [ ] **Step 1: Write failing release assertions**

Require version `5.25`, title `Надёжная доставка рассылок`, an English title, and cache `club-pwa-v215`.

- [ ] **Step 2: Run release tests and verify RED**

Run: `pnpm --filter @club/web test -- releaseNotes.test.ts pwa.test.ts`
Expected: FAIL on old version and cache.

- [ ] **Step 3: Publish release metadata**

Add release notes describing automatic retries, restart recovery, exact counters, and the `Повторить ошибки` action. Update version timestamp and cache name.

- [ ] **Step 4: Run complete verification**

Run: `pnpm test && pnpm build && git diff --check`
Expected: exit 0; Vite may retain the existing large-chunk warning.

- [ ] **Step 5: Commit, push, deploy, and verify production**

```bash
git add apps/web/src/features/app/version.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseNotes.test.ts apps/web/public/sw.js apps/web/src/features/app/pwa.test.ts
git commit -m "release: publish reliable mailing delivery"
git push origin main
```

Deploy with `/opt/club-pwa/deploy/update.sh`, then verify the deployed commit, `/api/health`, healthy API/PostgreSQL containers, running web/Caddy containers, and public service worker cache `club-pwa-v215`.

