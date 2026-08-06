# Test Reliability and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full test command deterministic and add a safe real-HTTP/real-PostgreSQL integration foundation for critical API behavior.

**Architecture:** Extract construction of the Hono application from Bun server startup so tests can call the same application through `app.request` without opening a port. Add a Docker-backed, explicitly opt-in integration project that migrates an isolated PostgreSQL database and exercises authentication and session boundaries while external delivery remains disabled.

**Tech Stack:** Bun, Hono, TypeScript, Vitest, Drizzle Kit, PostgreSQL 16, Docker Compose, pnpm.

## Global Constraints

- Never connect integration tests to a non-local database host.
- Never use production credentials or production data.
- Preserve all existing public API paths, cookies, CORS behavior, background jobs, and shutdown behavior.
- New production functions require a test that is observed failing before implementation.
- External SMTP, S3, push, and payment providers are not contacted by this test phase.

---

## File Structure

- `apps/api/src/app.ts`: constructs and exports the configured Hono application; does not bind a port or start jobs.
- `apps/api/src/index.ts`: Bun runtime entrypoint, background jobs, and graceful shutdown only.
- `apps/api/src/app.test.ts`: fast HTTP tests proving application construction has no listening side effect and public probes work.
- `apps/api/src/integration/databaseSafety.ts`: validates that integration database URLs are explicitly local and test-named.
- `apps/api/src/integration/databaseSafety.test.ts`: unit tests for the safety guard.
- `apps/api/src/integration/auth.integration.test.ts`: real PostgreSQL authentication/session HTTP tests.
- `apps/api/vitest.integration.config.ts`: isolated integration test configuration.
- `docker-compose.test.yml`: disposable PostgreSQL service bound to loopback on a non-production port.
- `scripts/run-api-integration.ps1`: Windows integration runner.
- `scripts/run-api-integration.sh`: Linux/CI integration runner.
- `.github/workflows/deploy.yml`: executes integration tests before build and browser tests.
- `apps/api/src/deploy/externalMonitoring.test.ts`: deterministic timeout budget for the existing shell regression test.
- `package.json` and `apps/api/package.json`: integration commands.

---

### Task 1: Remove the uptime regression timing flake

**Files:**
- Modify: `apps/api/src/deploy/externalMonitoring.test.ts`
- Modify: `scripts/check-public-uptime.test.sh`

**Interfaces:**
- Consumes: `scripts/check-public-uptime.sh`
- Produces: `UPTIME_TEST_NO_RETRY_DELAY=1` test-only switch used only by the regression harness.

- [ ] **Step 1: Add a failing duration assertion**

Wrap `spawnSync` with `performance.now()` and assert that the shell regression finishes below 2,500 ms when `UPTIME_TEST_NO_RETRY_DELAY=1` is passed in the child environment.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/api exec vitest run src/deploy/externalMonitoring.test.ts --reporter=verbose`

Expected: FAIL because the current checker still performs real retry delays and exceeds the deterministic budget.

- [ ] **Step 3: Make retry timing injectable in the shell regression**

In the fake `curl`, immediately return scenario responses. Pass `UPTIME_RETRY_DELAY_SECONDS=0` from `run_checker` when `UPTIME_TEST_NO_RETRY_DELAY=1`; update the checker to read the bounded delay variable with the existing production default.

- [ ] **Step 4: Verify GREEN and repeatability**

Run the focused test three consecutive times. Expected: all three runs PASS below the duration budget.

- [ ] **Step 5: Commit**

Commit message: `test: make uptime regression deterministic`

### Task 2: Separate Hono application construction from Bun startup

**Files:**
- Create: `apps/api/src/app.test.ts`
- Create: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Produces: `export function createApp(): Hono` and `export const app = createApp()` from `app.ts`.
- `index.ts` consumes `app.fetch` and retains server/job lifecycle.

- [ ] **Step 1: Write failing application-construction tests**

Test that importing `./app` exposes an object whose `request('/health')` returns `{ ok: true }`, and that importing it does not call `Bun.serve`.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/api exec vitest run src/app.test.ts`

Expected: FAIL because `src/app.ts` does not exist.

- [ ] **Step 3: Extract application configuration**

Move middleware, CORS, health/readiness/metrics routes, upload handling, client-error handling, and route mounting from `index.ts` into `createApp`. Keep runtime server creation, background-job startup, signals, and shutdown in `index.ts`.

- [ ] **Step 4: Verify GREEN and type safety**

Run: `pnpm --filter @club/api exec vitest run src/app.test.ts` and `pnpm --filter @club/api check`.

Expected: PASS with no type errors.

- [ ] **Step 5: Run existing API tests**

Run: `pnpm --filter @club/api test`.

Expected: PASS with no server port opened by tests.

- [ ] **Step 6: Commit**

Commit message: `refactor: separate api app from runtime startup`

### Task 3: Add a fail-closed integration database guard

**Files:**
- Create: `apps/api/src/integration/databaseSafety.test.ts`
- Create: `apps/api/src/integration/databaseSafety.ts`

**Interfaces:**
- Produces: `assertSafeIntegrationDatabaseUrl(value: string): URL`.
- Accepts only `postgres:` or `postgresql:` URLs using host `127.0.0.1`, `localhost`, or `::1`, with a database name ending `_test`.

- [ ] **Step 1: Write failing safety tests**

Cover accepted local URLs and rejected remote hosts, missing database names, production-like database names, and unsupported protocols.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/api exec vitest run src/integration/databaseSafety.test.ts`.

Expected: FAIL because the guard does not exist.

- [ ] **Step 3: Implement the minimal guard**

Parse with `new URL`, normalize the database pathname, enforce protocol, local hostname, and `_test` suffix, and throw `Unsafe integration database URL` for every rejected value.

- [ ] **Step 4: Verify GREEN**

Run the focused test and API type-check. Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `test: guard integration database targets`

### Task 4: Add disposable PostgreSQL integration infrastructure

**Files:**
- Create: `docker-compose.test.yml`
- Create: `apps/api/vitest.integration.config.ts`
- Create: `scripts/run-api-integration.ps1`
- Create: `scripts/run-api-integration.sh`
- Modify: `apps/api/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces root command `pnpm test:integration:api`.
- Test database URL: `postgres://club_test:club_test@127.0.0.1:55432/club_integration_test`.

- [ ] **Step 1: Add a failing structure test**

Create an API deploy test that asserts the integration compose service binds only `127.0.0.1:55432`, uses a `_test` database, has a healthcheck, and that both runners call the database safety guard before migrations.

- [ ] **Step 2: Verify RED**

Run the new structure test. Expected: FAIL because the infrastructure files do not exist.

- [ ] **Step 3: Implement disposable infrastructure**

Define PostgreSQL 16 with a named test-only volume, loopback port binding, healthcheck, and no production compose dependencies. Runners must start the service, wait for readiness, run Drizzle migrations, execute Vitest with `RUN_BACKGROUND_JOBS=false`, and always tear down with volumes.

- [ ] **Step 4: Verify GREEN without running integration tests**

Run the structure test and shell syntax check. Expected: PASS.

- [ ] **Step 5: Run the empty integration project**

Run: `pnpm test:integration:api`.

Expected: PostgreSQL starts, all migrations apply, Vitest exits successfully with no tests, and the container plus volume are removed.

- [ ] **Step 6: Commit**

Commit message: `test: add disposable api integration database`

### Task 5: Add real authentication and session integration tests

**Files:**
- Create: `apps/api/src/integration/auth.integration.test.ts`
- Modify: `apps/api/vitest.integration.config.ts`

**Interfaces:**
- Consumes: `app.request`, Drizzle database, migrated auth tables.
- Uses `AUTH_DEV_CODE_ENABLED=true`, a local SMTP-disabled test delivery path, and the `X-Club-PWA-Standalone: 1` header.

- [ ] **Step 1: Write the first failing HTTP test**

Assert that `POST /auth/email/start` without the PWA header returns 403 through the real application.

- [ ] **Step 2: Verify RED for integration discovery**

Run the integration command. Expected: FAIL until the integration config discovers and initializes the new suite correctly.

- [ ] **Step 3: Add deterministic test email delivery**

Configure the existing development-code path so tests do not require SMTP, without introducing a production bypass. The response exposes `devCode` only outside production when explicitly enabled.

- [ ] **Step 4: Add real database scenarios**

Through HTTP, verify: request code, verify code, receive `HttpOnly` session cookie, access `/me`, logout, and rejection of the revoked session. Assert persisted code consumption and session revocation through Drizzle queries.

- [ ] **Step 5: Add role-boundary scenario**

Create a normal member in the test database, authenticate it, and assert an administrative endpoint rejects access without changing database state.

- [ ] **Step 6: Verify GREEN and isolation**

Run the integration command twice. Expected: both runs PASS from clean migrated databases and remove containers afterward.

- [ ] **Step 7: Commit**

Commit message: `test: cover authentication through real api and postgres`

### Task 6: Enforce the integration suite in CI

**Files:**
- Create: `apps/api/src/deploy/integrationQuality.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/pwa-quality.yml`

**Interfaces:**
- CI consumes `pnpm test:integration:api` before production build and release browser tests.

- [ ] **Step 1: Write a failing workflow-policy test**

Assert that deploy quality runs integration tests after unit tests and before build, and uploads integration diagnostics on failure.

- [ ] **Step 2: Verify RED**

Run the focused deploy policy test. Expected: FAIL because workflows do not call the integration command.

- [ ] **Step 3: Update workflows**

Run the disposable integration suite in deploy quality. Keep PWA device regression focused on browser work; do not duplicate the database suite in the nightly device matrix.

- [ ] **Step 4: Verify GREEN**

Run the policy test, type-check, and workflow-related API tests. Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `ci: require api integration tests before deploy`

### Task 7: Phase verification

**Files:**
- Modify only files required by failures attributable to this phase.

- [ ] **Step 1: Run deterministic test repetition**

Run the uptime regression three times and the full `pnpm test` twice. Expected: every run exits 0 with no timeout failures.

- [ ] **Step 2: Run integration verification**

Run `pnpm test:integration:api` twice. Expected: clean database each time and no leftover test container or volume.

- [ ] **Step 3: Run repository verification**

Run `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`. Expected: all exit 0; platform-conditional skips remain documented.

- [ ] **Step 4: Inspect repository state**

Run `git diff --check`, inspect all diffs, and confirm no environment file, database dump, test credential, generated report, or production data is tracked.

- [ ] **Step 5: Commit verification-only corrections if required**

Commit message: `test: complete integration reliability phase`
