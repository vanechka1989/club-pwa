# Task 12 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Task 12's mock/text release gates with deterministic browser behavior, persistence-backed security boundaries, behavioral load limits, and fail-closed CI integrations.

**Architecture:** Keep the production community route as the end-to-end boundary, but expose narrow dependency-injected repository operations where PostgreSQL concurrency and query counts must be observed directly. Centralize integration environment validation so every external suite either runs with a complete configuration or fails CI before Vitest can skip it.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, Vitest, Playwright, GitHub Actions, MinIO/S3, ClamAV.

## Global Constraints

- Use RED→GREEN for every production behavior change.
- Release Playwright verification runs with retries set to zero.
- External PostgreSQL, S3, and ClamAV tests may skip only when all integration variables are absent and `CI` is not `true`.
- ClamAV keeps a 4 GiB container ceiling and the workflow performs memory/disk preflight before startup.

---

### Task 1: Deterministic real-offline browser scenario

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `playwright.release.config.ts`

**Interfaces:**
- Consumes: `navigator.onLine`, community outbox retry behavior, notification settings UI.
- Produces: a controllable `__communityReleaseOnline` browser fixture and zero-retry release matrix.

- [ ] Add a Playwright fixture whose init script defines `navigator.onLine` from mutable page state before app startup.
- [ ] Run the WebKit outbox test repeatedly and observe failure against the current 503-based fixture.
- [ ] Keep the browser offline across enqueue and reload, assert zero POST attempts, flip online without dispatching `online`, then manually retry once with the same operation id.
- [ ] Start notification mode at `all`, select `mentions`, invalidate/reload, and assert the persisted selection.
- [ ] Set release retries to `0`; run the new scenarios repeatedly in WebKit and in the full parallel matrix.

### Task 2: Fail-closed integration configuration

**Files:**
- Modify: `apps/api/src/community/postgresTestGate.ts`
- Modify: `apps/api/src/community/postgresTestGate.test.ts`
- Modify: PostgreSQL integration suites under `apps/api/src/community/*.postgres.test.ts`
- Modify: `apps/api/src/storage/s3ImmutablePromotion.integration.test.ts`
- Modify: `apps/api/src/community/communitySecurityIntegration.test.ts`

**Interfaces:**
- Produces: `resolveCommunityIntegrationTestConfig(environment)` returning complete PostgreSQL, S3, and ClamAV settings or `undefined` for a fully unconfigured non-CI machine.

- [ ] Add failing table-driven tests for partial groups, malformed database URLs, and ClamAV ports outside `1..65535`.
- [ ] Implement one resolver that throws for partial configuration or any missing CI field.
- [ ] Route every PostgreSQL/S3/ClamAV conditional suite through that resolver so CI cannot convert drift into skips.
- [ ] Run the resolver and focused integration-gate tests.

### Task 3: Atomic PostgreSQL rate-limit boundary

**Files:**
- Modify: `apps/api/src/security/persistentCommunityReadRateLimit.ts`
- Modify: `apps/api/src/security/persistentWriteRateLimit.ts`
- Create: `apps/api/src/security/communityRateLimits.postgres.test.ts`

**Interfaces:**
- Produces: injectable/exported read and write allowance consumers accepting a Drizzle-compatible database and server time.

- [ ] Write PostgreSQL tests for exact limits 30/60, separate user/scope keys, window reset, and concurrent increments.
- [ ] Run them against the current private/hard-wired consumers and observe the missing interface failure.
- [ ] Extract the minimal consumers without changing middleware responses; make middleware call them by default.
- [ ] Run unit and PostgreSQL rate-limit suites.

### Task 4: PostgreSQL-backed BOLA routes

**Files:**
- Create: `apps/api/src/community/communityBola.postgres.test.ts`

**Interfaces:**
- Consumes: production `communityRoute`, production message mutation repository/service, and upload ownership predicates.

- [ ] Create a schema-isolated PostgreSQL fixture with two users, public/admin topics, messages, and upload manifests.
- [ ] Exercise the actual route as the foreign user for private topic read, message PATCH/DELETE, upload refresh, PUT complete, and multipart complete.
- [ ] Assert 403/404 responses and byte-for-byte unchanged message/manifest ownership and lifecycle columns.
- [ ] Run the BOLA suite with a temporary local PostgreSQL URL when available; otherwise verify its fail-closed resolver behavior locally.

### Task 5: Behavioral bounded-load gates

**Files:**
- Modify: `apps/api/src/community/communityLoadModel.test.ts`
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/api/src/community/uploadSessions.ts`
- Modify: `apps/api/src/community/documentScanner.ts`
- Modify: `apps/api/src/community/mediaProcessor.ts`

**Interfaces:**
- Produces: observable repository boundaries for topic aggregates and worker candidate selection; route normalization caps message pages at 100.

- [ ] Add a failing route test for `limit=10000` that observes a 101-row database fetch and a 100-message response.
- [ ] Add failing repository-spy tests proving topic aggregation uses a fixed three calls for one and many topics.
- [ ] Add failing worker tests that pass oversized requested limits and observe actual candidate-query caps of upload `50`, scanner `25`, media `4`, and sweep `50`.
- [ ] Preserve the one negative source check only for direct-upload `formData()` absence; remove every other source-string assertion.
- [ ] Keep existing observed browser multipart concurrency `4` and voice conversion concurrency `2` tests in the focused gate.

### Task 6: Parsed CI workflow and complete verification

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `apps/api/src/deploy/pwaQuality.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: parsed GitHub Actions YAML.
- Produces: a preflighted integration step ordered before tests with complete environment wiring.

- [ ] Add `yaml` as a root dev dependency and replace string searches with parsed workflow assertions covering the complete env and step order.
- [ ] Add failing assertions for a memory/disk preflight before the 4 GiB ClamAV container.
- [ ] Implement the workflow preflight and an explicit focused external-integration test step.
- [ ] Run focused API/Web tests, repeated zero-retry E2E, full `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] Commit with the Task 12 review remediation message and report the external services that could not run locally.
