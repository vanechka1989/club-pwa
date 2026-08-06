# Technical Hardening Program Design

**Date:** 2026-08-06  
**Status:** Approved direction, pending written-spec review

## Objective

Strengthen Club PWA without changing its product behavior or production data. The program must improve confidence in releases, dependency security, maintainability, operational readiness, documentation, disaster recovery, and offline resilience.

## Delivery Strategy

The work is split into independently releasable phases. Each phase must leave the repository buildable and must not depend on an unfinished later phase.

1. Test reliability and real API/database integration coverage.
2. Dependency remediation and automated code-quality gates.
3. Incremental decomposition of the largest backend and frontend modules.
4. Production configuration validation, dependency readiness, and worker heartbeat monitoring.
5. Current architecture, environment, and incident documentation.
6. Automated PostgreSQL restore verification.
7. Versioned application-shell caching and a bounded offline data strategy.

Security, payments, authentication, authorization, and database migrations receive tests before their production code changes. Refactors must preserve public HTTP contracts and shared schemas.

## Phase 1: Test Reliability and Integration Coverage

### Flaky monitoring test

The external-monitoring test must stop depending on wall-clock execution close to Vitest's five-second timeout. The shell script remains covered, but test dependencies such as retry delays and DNS responses must be deterministic. Increasing the global timeout alone is not an acceptable fix.

### Integration harness

Add an opt-in integration test project that:

- starts an isolated PostgreSQL instance;
- applies every Drizzle migration from an empty database;
- starts the Hono application without binding a production port;
- performs real HTTP requests through `app.request`;
- resets database state between suites;
- refuses non-local or non-test database URLs.

Initial integration scenarios cover email authentication, session revocation, role boundaries, cross-user object access, idempotent payment events, and migration startup. External SMTP, S3, push, and payment providers remain deterministic fakes at the network boundary.

### Coverage

Vitest coverage is reported separately for `shared`, `api`, and `web`. Initial thresholds record the current baseline and prevent regression. Auth, payment policy, and permission modules receive stricter branch thresholds after integration tests exist.

## Phase 2: Dependencies and Quality Gates

Upgrade direct dependencies to versions that remove current audit findings, including Hono. Resolve transitive `brace-expansion`, PostCSS, and esbuild advisories through parent upgrades or documented temporary pnpm overrides.

Add ESLint for TypeScript and Vue, formatting verification, unused-export/dependency checks, and circular-import detection. Existing debt may use a committed baseline, but new violations fail CI. Generated files, release-history data, and migrations receive explicit exemptions rather than broad directory exclusions.

CI must run install, dependency audit, type-check, lint, unit tests, integration tests, production build, and the focused release browser matrix in that order.

## Phase 3: Incremental Module Decomposition

Refactoring is behavior-preserving and proceeds one product domain at a time.

### Backend

Split the administrative route into focused route factories under `apps/api/src/routes/admin/`. HTTP parsing and response mapping stay in routes; reusable business operations move to domain services; permission checks remain centralized. The public `/admin/*` paths and response schemas do not change.

Split the database schema into domain files only after migration and relation tests prove that generated table metadata remains unchanged.

### Frontend

Extract learning and administration tasks from their section components. Stateful workflows move into focused composables; leaf UI moves into components. Router paths, API calls, accessibility names, and visual output remain stable. CSS moves by ownership while existing bundle-budget and route-CSS tests stay green.

No phase attempts a wholesale rewrite. A module is extracted only when it has a clear interface and independent behavioral coverage.

## Phase 4: Production Readiness and Worker Monitoring

Keep `/health` as a process liveness probe. Expand `/ready` only with dependencies required to accept normal user traffic: database connectivity, migration compatibility, and required Redis connectivity.

Add a protected integration-status report for optional capabilities such as SMTP, S3, push, and payment providers. Production environment validation follows conditional rules: a disabled integration requires no secrets; an enabled integration must have a complete, valid configuration.

Background jobs record last start, last success, last failure, duration, and worker identity. The worker exposes stale-job status through the protected operational report. API replicas continue to run with background jobs disabled in the scale compose configuration.

## Phase 5: Documentation

Replace outdated template claims in README and ARCHITECTURE with the actual system. Add:

- a component and data-flow overview;
- an authoritative environment-variable reference;
- deployment and rollback boundaries;
- runbooks for database, Redis, SMTP, S3, payment reconciliation, stale workers, and service-worker recovery;
- architecture decision records for same-origin cookie authentication, the single-worker model, payment idempotency, and storage fallback.

Production target rules from `AGENTS.md` remain authoritative and are not duplicated with conflicting values.

## Phase 6: Automated Restore Verification

Add a weekly restore drill that downloads the newest database backup into an isolated temporary directory, verifies metadata and checksum when present, restores into an ephemeral PostgreSQL instance, validates migration metadata and key tables, runs bounded read-only smoke queries, and destroys the temporary environment.

The drill must never target the production database, expose the restored port publicly, or print restored personal data. It records backup age, restore duration, schema validation, and final status. Failure triggers the existing operational alert path.

Document explicit initial objectives:

- RPO: at most 24 hours while nightly backups remain the source of recovery;
- RTO drill target: a validated restore completed within two hours.

Changing those objectives requires a separate design for more frequent backups, WAL archiving, or point-in-time recovery.

## Phase 7: Offline Resilience

The first offline release caches only the versioned application shell and immutable build assets. It does not cache authenticated API responses in Cache Storage.

Use the release or build identifier for cache names. A new service worker precaches the shell, activates only after successful installation, removes obsolete owned caches, and preserves existing update-recovery behavior.

IndexedDB is introduced only for bounded, explicitly non-sensitive client state:

- pending learning completion events;
- engagement events already represented by the current local outbox;
- upload recovery metadata without file contents unless explicitly approved later.

Queued mutations carry idempotency keys and expose clear pending, synchronized, and failed states. Administrative responses, payment details, session material, and support conversations are not cached offline in this phase.

## Security and Privacy Constraints

- Do not access or mutate production while implementing this program.
- Do not copy production personal data into test fixtures or restore artifacts.
- Do not weaken CSP, cookie flags, authorization, rate limits, container restrictions, or audit logging.
- Do not expose integration secrets through readiness or diagnostics.
- Preserve same-origin cookie authentication and existing PWA standalone checks unless a separate security design approves a change.

## Verification

Every phase must provide fresh evidence for its scope:

- focused red/green tests for behavioral changes;
- `pnpm check`;
- lint and formatting checks after Phase 2;
- relevant unit and integration suites;
- `pnpm build`;
- focused Playwright release tests for frontend or PWA changes;
- `pnpm audit` after dependency changes;
- clean migration from an empty database for schema-related changes;
- isolated restore drill for backup work.

The full test command must be stable across repeated runs before the program is considered complete. Known skips must be documented as platform-conditional rather than silently ignored.

## Non-Goals

- Product redesign or new customer-facing business features.
- Replacing Vue, Hono, Drizzle, PostgreSQL, or pnpm.
- A complete offline mirror of authenticated application data.
- Production deployment as part of implementation.
- Immediate decomposition of every large file in one change.

## Success Criteria

- Repeated full test runs complete without timing flakes.
- Critical HTTP authorization and payment flows have real API/database integration coverage.
- Current dependency audit findings are remediated or explicitly risk-accepted with expiry.
- CI enforces lint, formatting, coverage non-regression, and architecture checks.
- The largest modules are reduced through reviewed, behavior-preserving extractions.
- Readiness and protected diagnostics distinguish core availability from optional integration health.
- A weekly isolated restore drill proves that the newest backup is recoverable.
- The installed PWA can reopen its application shell offline and safely synchronize supported queued learning events.
- README, architecture, environment reference, and runbooks describe the deployed system accurately.
