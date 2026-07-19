# Learning Save Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a lost final HTTP response from producing a false lesson-save error or a duplicate learning card.

**Architecture:** A durable PostgreSQL idempotency operation is scoped by administrator, operation type, and UUID key. The direct-create API fingerprints the request, claims the key, creates the card once, and exposes an authenticated status lookup; the web client reconciles only response-less network failures and otherwise preserves current error handling.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Vue 3, ofetch, Vitest, pnpm.

## Global Constraints

- Keep old cached clients compatible by making `Idempotency-Key` optional on the API.
- The updated client always sends a UUID key for direct creation with uploaded files.
- Never retry the create blindly and never create a second card for one key.
- Reconcile only errors without an HTTP response.
- Bound status polling; unresolved, failed, or absent operations remain visible errors.

---

### Task 1: Durable operation model and shared contracts

**Files:**
- Create: `apps/api/drizzle/0048_idempotency_operations.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/idempotency/operation.test.ts`
- Create: `apps/api/src/idempotency/operation.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `learningSaveOperationResponseSchema` and `LearningSaveOperationResponse`.
- Produces: `createRequestFingerprint(value): string` and operation status constants.
- Produces: `idempotencyOperations` Drizzle table with unique `(actorTelegramId, scope, idempotencyKey)`.

- [ ] **Step 1: Write the failing unit and migration contract tests**

Test deterministic fingerprints regardless of object key ordering, different fingerprints for different payloads, the operation statuses, and presence of the migration/table/index contract.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @club/api test -- src/idempotency/operation.test.ts`
Expected: FAIL because the operation module and migration do not exist.

- [ ] **Step 3: Add the minimal schema, migration, contracts, and fingerprint helper**

Use SHA-256 over recursively key-sorted JSON. Define statuses `processing`, `succeeded`, and `failed`; retain `resource_id`, request fingerprint, safe error code, timestamps, and 30-day expiry. Add migration journal entry `0048_idempotency_operations`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `pnpm --filter @club/api test -- src/idempotency/operation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/drizzle apps/api/src/db/schema.ts apps/api/src/idempotency packages/shared/src/index.ts
git commit -m "feat(api): add durable idempotency operations"
```

### Task 2: Idempotent learning-card API and status lookup

**Files:**
- Create: `apps/api/src/learning/learningSaveIdempotency.test.ts`
- Create: `apps/api/src/learning/learningSaveIdempotency.ts`
- Modify: `apps/api/src/routes/admin.ts`

**Interfaces:**
- Consumes: `createRequestFingerprint`, `idempotencyOperations`, and `LearningSaveOperationResponse`.
- Produces: optional `Idempotency-Key` behavior on `POST /admin/learning/materials/direct`.
- Produces: `GET /admin/learning/materials/operations/:key`.

- [ ] **Step 1: Write failing behavior tests**

Cover a new claim, repeated successful key, mismatched fingerprint, actor isolation, processing status, failed status, and one-card result for repeated creates. Use injected repository functions for the decision logic and a source contract test for route wiring.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @club/api test -- src/learning/learningSaveIdempotency.test.ts`
Expected: FAIL because claim/lookup logic and routes are missing.

- [ ] **Step 3: Implement minimal operation decision logic and route wiring**

Validate the UUID header, fingerprint the parsed payload, scope records to `c.get("telegramUser").id`, and use the unique key as the concurrency boundary. Return an existing successful material for a matching repeated request, reject key reuse with different input, and expose the bounded status representation. Mark definitive create failures as `failed`; mark success with the created card ID before returning the serialized response.

- [ ] **Step 4: Run focused API tests to verify GREEN**

Run: `pnpm --filter @club/api test -- src/learning/learningSaveIdempotency.test.ts src/learning/mediaUpload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/learning apps/api/src/routes/admin.ts
git commit -m "feat(api): make direct lesson creation idempotent"
```

### Task 3: Client reconciliation for an ambiguous final response

**Files:**
- Create: `apps/web/src/features/learning/lessonSaveReconciliation.test.ts`
- Create: `apps/web/src/features/learning/lessonSaveReconciliation.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningBackgroundUpload.test.ts`

**Interfaces:**
- Consumes: `LearningSaveOperationResponse`.
- Produces: `createAdminLearningMaterialDirect(payload, { idempotencyKey })`.
- Produces: `getAdminLearningMaterialOperation(key)`.
- Produces: `isAmbiguousNetworkError(error)` and `reconcileLearningSave({ loadOperation, ... })`.

- [ ] **Step 1: Write failing reconciliation tests**

Assert that response-less fetch failures enter reconciliation; HTTP 4xx/5xx errors do not; `succeeded` returns the saved material; `processing` is polled; and failed, absent, or unreachable terminal outcomes throw the original save error.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @club/web test -- src/features/learning/lessonSaveReconciliation.test.ts`
Expected: FAIL because the reconciliation helper is missing.

- [ ] **Step 3: Implement minimal helper and integrate the background save**

Generate one `crypto.randomUUID()` per background task. Send it in `Idempotency-Key`, and on a response-less final-create failure poll the operation endpoint with short bounded delays. Feed a recovered material through the same `addMaterialToModule` success path; retain the existing error task and client-error report for all unresolved outcomes.

- [ ] **Step 4: Run focused web tests to verify GREEN**

Run: `pnpm --filter @club/web test -- src/features/learning/lessonSaveReconciliation.test.ts src/features/learning/learningBackgroundUpload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/features/learning
git commit -m "fix(web): reconcile interrupted lesson saves"
```

### Task 4: Full verification and release readiness

**Files:**
- Modify only if verification exposes a defect in the planned behavior.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified migration, API, web client, and production build.

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: all workspace test suites PASS.

- [ ] **Step 2: Run production build**

Run: `pnpm build`
Expected: TypeScript checks and Vite build exit 0.

- [ ] **Step 3: Validate patches**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only intended changes, if any, are shown.

- [ ] **Step 4: Review requirements against the design**

Confirm that a saved operation recovers without an error, a missing/failed operation shows the error, repeated keys cannot duplicate cards, actor isolation is enforced, and old clients remain compatible.
