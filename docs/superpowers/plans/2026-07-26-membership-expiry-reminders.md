# Membership Expiry Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one access-expiry reminder at 10:00 project time three days before, one day before, and on the expiry date through PWA, push, and email.

**Architecture:** A pure planner calculates due reminder stages in `Asia/Novosibirsk`; an hourly database-backed worker claims channel deliveries using a unique key tied to the exact subscription expiry timestamp. Each channel records its own status and retry time so transient email or push failures never duplicate PWA notifications.

**Tech Stack:** Bun, TypeScript, Drizzle ORM, PostgreSQL, Vitest, Nodemailer, Web Push.

## Global Constraints

- Run the worker once per hour and immediately after API startup.
- Use `Asia/Novosibirsk` as the project timezone and 10:00 as the reminder time.
- Stages are three days before, one day before, and the calendar day of expiry.
- Deliver through PWA, push, and email; missing push subscriptions are a successful no-op.
- Re-read the subscription before delivery and never send reminders for a changed, inactive, or expired subscription.
- Prevent duplicate sends across restarts and multiple API processes with database uniqueness and atomic claims.
- Retry only the failed channel with bounded attempts.

---

### Task 1: Reminder schedule and copy

**Files:**
- Create: `apps/api/src/membership/expiryReminderPlan.ts`
- Test: `apps/api/src/membership/expiryReminderPlan.test.ts`

**Interfaces:**
- Produces: `getDueExpiryReminderStages(expiresAt: Date, now: Date): ExpiryReminderStage[]`.
- Produces: `buildExpiryReminderMessage(stage: ExpiryReminderStage, expiresAt: Date): { title: string; body: string; emailHtml: string }`.

- [ ] **Step 1: Write failing tests** for all three calendar stages at/after 10:00 Novosibirsk, no delivery before 10:00, no delivery after expiry, and Russian copy with the exact expiry date.
- [ ] **Step 2: Run** `pnpm --filter @club/api test -- expiryReminderPlan.test.ts` and verify failures are caused by the missing module.
- [ ] **Step 3: Implement** timezone-safe date keys with `Intl.DateTimeFormat`, stage selection, and escaped email HTML containing a `/payments` renewal link.
- [ ] **Step 4: Run** the focused test and verify it passes.

### Task 2: Persistent per-channel delivery ledger

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0056_membership_expiry_reminders.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/src/membership/expiryReminderLedger.ts`
- Test: `apps/api/src/membership/expiryReminderLedger.test.ts`

**Interfaces:**
- Produces table `membership_expiry_reminder_deliveries` with `subscriptionId`, `userId`, `expiresAt`, `stage`, `channel`, `status`, `attemptCount`, `nextAttemptAt`, `lastAttemptAt`, `sentAt`, `error`, and timestamps.
- Produces: `claimExpiryReminderDelivery(input): Promise<ClaimedDelivery | null>` and `completeExpiryReminderDelivery(id, result): Promise<void>`.

- [ ] **Step 1: Write failing tests** asserting the migration contains an expiry lookup index and a unique `(subscription_id, expires_at, stage, channel)` index; assert claim eligibility and exponential retry calculations in pure exported helpers.
- [ ] **Step 2: Run** the focused ledger test and verify expected failures.
- [ ] **Step 3: Add** the schema, migration, relations/types, atomic insert-or-reclaim logic, maximum three attempts, and retry delays of 15 minutes then 60 minutes.
- [ ] **Step 4: Run** the focused test and verify it passes.

### Task 3: Hourly delivery worker

**Files:**
- Create: `apps/api/src/membership/expiryReminderJob.ts`
- Test: `apps/api/src/membership/expiryReminderJob.test.ts`
- Modify: `apps/api/src/backgroundJobs.ts`

**Interfaces:**
- Consumes the planner and ledger from Tasks 1-2.
- Produces: `runMembershipExpiryReminders(now?: Date): Promise<ExpiryReminderRunResult>` and `startMembershipExpiryReminderJob(): ReturnType<typeof setInterval>`.

- [ ] **Step 1: Write failing tests** with injected stores/senders covering due-client selection, subscription re-check, stale expiry rejection, independent PWA/push/email outcomes, missing push success, and one-hour timer registration.
- [ ] **Step 2: Run** the focused worker test and verify expected failures.
- [ ] **Step 3: Implement** a batch query for active subscriptions expiring in the relevant range; create the PWA row directly, send push through `sendWebPushToUser`, and email through `sendEmail` with category `transactional` and link `${env.WEB_ORIGIN}/payments`.
- [ ] **Step 4: Register** the worker in `startBackgroundJobs`, including cleanup in its returned stop function.
- [ ] **Step 5: Run** focused planner, ledger, worker, notification, push, and email tests.

### Task 4: Release verification and deployment

**Files:**
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: repository version source used by the existing release process.

**Interfaces:**
- Produces production migration 0056, an active hourly worker, release note, and post-deploy notification through the existing release workflow.

- [ ] **Step 1: Add** a release note describing three expiry reminders and their channels.
- [ ] **Step 2: Run** `pnpm test`, `pnpm check`, and `pnpm build`; require zero failures.
- [ ] **Step 3: Inspect** `git diff --check`, migration SQL, and secrets scan of the diff.
- [ ] **Step 4: Commit and push** the implementation on `main` using the repository's current deployment workflow.
- [ ] **Step 5: Verify** production migration status, `/api/health`, `/api/ready`, container health, worker startup logs, and a dry/test planner run that does not contact real clients.
