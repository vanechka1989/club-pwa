# Stability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Club PWA recoverable from verified backups, observable from outside its VPS, resource-bounded, and protected by automated source and mobile-display gates.

**Architecture:** Keep the current single-VPS Compose stack and add small systemd jobs plus GitHub-hosted checks around it. Reuse the application's database-backed S3 configuration and SMTP delivery, keep Kuma isolated from Docker, and make every infrastructure change testable through source assertions and production health evidence.

**Tech Stack:** Bun, TypeScript, Vitest, PostgreSQL 16, Docker Compose, systemd, Bash, AWS SDK S3, nodemailer, GitHub Actions, Playwright, Vue 3 PWA.

## Global Constraints

- No database schema migration is required.
- Never print S3, SMTP, database, session, or backup credentials.
- Backups use private S3 prefixes and 30-day retention.
- Restore verification must use an isolated temporary PostgreSQL 16 container with no published port.
- Kuma keeps no Docker socket, runs rootless/read-only, and remains private.
- External checks run outside the VPS at least every five minutes.
- Container budgets must reserve at least 384 MB RAM for the host.
- API writes remain network-only; no service-worker caching of `/api/`.
- Deployment retains post-start health verification and rollback.

---

### Task 1: Durable database backup status and timer installation

**Files:**
- Modify: `scripts/backup-postgres-s3.sh`
- Modify: `deploy/install-backup-timer.sh`
- Modify: `deploy/update-worker.sh`
- Modify: `apps/api/src/deploy/updateScript.test.ts`
- Create: `apps/api/src/deploy/backupInfrastructure.test.ts`

**Interfaces:**
- Consumes: `runAutomaticDatabaseBackup({ retentionDays })` output from `apps/api/src/db/runAutomaticBackup.ts`.
- Produces: `/var/lib/club-pwa-backup/database.env` with `STATUS`, `FINISHED_AT`, and sanitized `DETAIL`; active `club-pwa-backup.timer`.

- [ ] **Step 1: Write failing infrastructure tests**

```ts
expect(backupScript).toContain('STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/club-pwa-backup}"');
expect(backupScript).toContain('STATUS=success');
expect(installer).toContain("club-pwa-backup.timer");
expect(installer).toContain("Persistent=true");
expect(updateWorker).toContain('deploy/install-backup-timer.sh');
```

- [ ] **Step 2: Run the tests and confirm the missing installer integration fails**

Run: `pnpm exec vitest run apps/api/src/deploy/backupInfrastructure.test.ts apps/api/src/deploy/updateScript.test.ts`

Expected: FAIL because the deployment worker does not install the backup timer and the wrapper has no status file.

- [ ] **Step 3: Implement atomic, secret-safe status writes**

Use a temporary file followed by `mv`, store only the final sanitized output line, and set a failure status through an `ERR` trap. Keep `docker compose run --rm --no-deps api bun apps/api/src/db/runAutomaticBackup.ts` as the actual backup operation.

- [ ] **Step 4: Make timer installation idempotent during full deployment reconciliation**

Run the installer after the new source is checked out and before the deployment is marked healthy. `systemctl daemon-reload` and `systemctl enable --now` must be safe on every run.

- [ ] **Step 5: Verify and commit**

Run: `bash -n scripts/backup-postgres-s3.sh deploy/install-backup-timer.sh deploy/update-worker.sh`

Run: `pnpm exec vitest run apps/api/src/deploy/backupInfrastructure.test.ts apps/api/src/deploy/updateScript.test.ts`

Commit: `feat: automate database backup timer`

### Task 2: Isolated weekly restore verification

**Files:**
- Modify: `apps/api/src/storage/s3.ts`
- Modify: `apps/api/src/db/automaticBackupPolicy.ts`
- Create: `apps/api/src/db/exportLatestAutomaticBackup.ts`
- Create: `scripts/verify-postgres-backup.sh`
- Modify: `deploy/install-backup-timer.sh`
- Modify: `apps/api/src/db/automaticBackup.test.ts`
- Modify: `apps/api/src/deploy/backupInfrastructure.test.ts`

**Interfaces:**
- Produces: `downloadObjectBytes(key, target?): Promise<Uint8Array>` in `storage/s3.ts`.
- Produces: `selectLatestBackupObject(objects)` in `automaticBackupPolicy.ts`.
- Produces: `/var/lib/club-pwa-backup/restore.env` and `club-pwa-backup-verify.timer`.

- [ ] **Step 1: Add failing policy and script-contract tests**

```ts
expect(selectLatestBackupObject([
  { key: "system/database-backups/old.dump", lastModified: "2026-07-20T00:00:00.000Z" },
  { key: "system/database-backups/new.dump", lastModified: "2026-07-22T00:00:00.000Z" }
])?.key).toBe("system/database-backups/new.dump");
expect(verifyScript).toContain("postgres:16-alpine");
expect(verifyScript).toContain("--network none");
expect(verifyScript).toContain("trap cleanup EXIT");
```

- [ ] **Step 2: Confirm the new tests fail**

Run: `pnpm exec vitest run apps/api/src/db/automaticBackup.test.ts apps/api/src/deploy/backupInfrastructure.test.ts`

- [ ] **Step 3: Add an S3 byte-download helper and one-shot exporter**

The helper sends `GetObjectCommand`, requires a body, and uses `response.Body.transformToByteArray()`. The exporter chooses the latest object under `automaticBackupPrefix`, writes it only to the explicit output path, prints key/size JSON, and exits non-zero on any error.

- [ ] **Step 4: Restore into a temporary PostgreSQL container**

The host script creates a validated `mktemp -d` directory, bind-mounts only that directory, starts PostgreSQL 16 without publishing ports, waits for `pg_isready`, restores with `pg_restore`, queries essential tables through `psql`, and removes the container and temp directory in `cleanup`.

- [ ] **Step 5: Install a weekly persistent timer and verify**

Use Sunday 04:30 Asia/Novosibirsk equivalent, with random delay under 20 minutes. Run shell syntax tests and the focused Vitest files.

Commit: `feat: verify database backup restores`

### Task 3: Consistent Uptime Kuma backup

**Files:**
- Create: `apps/api/src/storage/uploadOperationalBackup.ts`
- Create: `scripts/backup-uptime-kuma-s3.sh`
- Modify: `deploy/install-backup-timer.sh`
- Modify: `apps/api/src/deploy/backupInfrastructure.test.ts`

**Interfaces:**
- Consumes: explicit local file path and fixed prefix selector (`uptime-kuma`).
- Produces: private objects under `system/uptime-kuma-backups/` and `/var/lib/club-pwa-backup/kuma.env`.

- [ ] **Step 1: Add failing assertions for SQLite online backup and private prefix**

```ts
expect(kumaScript).toContain('sqlite3 /app/data/kuma.db ".backup');
expect(kumaScript).toContain("system/uptime-kuma-backups/");
expect(kumaScript).not.toContain("docker.sock");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run apps/api/src/deploy/backupInfrastructure.test.ts`

- [ ] **Step 3: Implement the snapshot and upload path**

Create the SQLite snapshot inside the Kuma container, copy only the snapshot and non-secret config into a validated temporary directory, and run the API uploader with a read-only bind mount. Verify uploaded metadata size before success and retain 30 days.

- [ ] **Step 4: Add the Kuma job to the nightly timer**

The database and Kuma jobs report independently so one failure does not erase the other's successful status.

- [ ] **Step 5: Verify and commit**

Run shell syntax, TypeScript check, and focused tests.

Commit: `feat: back up uptime kuma data`

### Task 4: External public monitor and incident issue

**Files:**
- Create: `.github/workflows/external-uptime.yml`
- Create: `scripts/check-public-uptime.sh`
- Create: `apps/api/src/deploy/externalMonitoring.test.ts`

**Interfaces:**
- Produces: five-minute external PWA/API/TLS check and one deduplicated issue labelled `production-incident`.

- [ ] **Step 1: Add failing workflow contract tests**

```ts
expect(workflow).toContain("*/5 * * * *");
expect(workflow).toContain("issues: write");
expect(checkScript).toContain("/api/health");
expect(checkScript).toContain("/api/ready");
expect(checkScript).toContain("--max-time 10");
```

- [ ] **Step 2: Confirm failure, then implement bounded checks**

Use three attempts per URL, exact `"ok":true` checks, and normal TLS validation. Do not use `-k`.

- [ ] **Step 3: Implement issue deduplication and recovery**

Use `actions/github-script` with `issues: write`: find the one open issue by label/title, create it only when absent, add a timestamped failure comment on later runs, and close it on recovery.

- [ ] **Step 4: Validate YAML/script and commit**

Run `bash -n scripts/check-public-uptime.sh` and focused tests.

Commit: `feat: add external uptime checks`

### Task 5: Host capacity probe and operational email

**Files:**
- Create: `apps/api/src/operations/sendOperationalAlert.ts`
- Create: `scripts/check-host-capacity.sh`
- Create: `deploy/install-host-monitor-timer.sh`
- Modify: `deploy/update-worker.sh`
- Create: `apps/api/src/deploy/hostMonitoring.test.ts`

**Interfaces:**
- Consumes: severity, stable incident key, subject, and detail passed as arguments to the one-shot TypeScript sender.
- Produces: `/var/lib/club-pwa-monitor/status.env`, transition-only owner email, and an every-minute persistent timer.

- [ ] **Step 1: Write failing threshold and deduplication tests**

Assert disk thresholds `75/85/92`, memory threshold `262144` KiB, unhealthy/OOM detection, `LAST_INCIDENT_KEY`, and transition-only alert invocation.

- [ ] **Step 2: Implement a read-only host probe**

Read `df`, `/proc/meminfo`, and `docker inspect` for the fixed production service names. Never enumerate or expose container environment variables.

- [ ] **Step 3: Implement owner email through existing `sendEmail`**

Use `env.OWNER_EMAIL`, category `transactional`, plain text plus escaped HTML, and no credentials or raw container inspect JSON in the message.

- [ ] **Step 4: Install, verify, and commit**

Run shell syntax, API check, and focused tests.

Commit: `feat: monitor host capacity`

### Task 6: Resource budgets and deployment quality gate

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `apps/api/src/deploy/securityConfig.test.ts`
- Modify: `apps/api/src/deploy/updateScript.test.ts`

**Interfaces:**
- Produces: bounded memory/PID budgets and `deploy.needs: quality`.

- [ ] **Step 1: Add failing security and workflow assertions**

Require memory, CPU, and PID limits for `postgres`, `api`, `web`, and `caddy`; require checkout, pnpm setup, frozen install, check, test, build, and a dependent deploy job.

- [ ] **Step 2: Confirm tests fail**

Run: `pnpm exec vitest run apps/api/src/deploy/securityConfig.test.ts apps/api/src/deploy/updateScript.test.ts`

- [ ] **Step 3: Add conservative limits**

Use initial maximums that leave at least 384 MB host headroom: PostgreSQL 512 MB, API 512 MB, web 128 MB, Caddy 128 MB, Kuma 256 MB; use bounded PIDs and CPU shares. Validate against the 100-client load workflow before deployment.

- [ ] **Step 4: Add the quality job without weakening rollback**

The quality job runs on the exact pushed commit. `deploy` has `needs: quality`; remote health verification remains unchanged.

- [ ] **Step 5: Validate and commit**

Run Compose validation, focused tests, full check/test/build.

Commit: `ci: gate deployment on quality checks`

### Task 7: Automated PWA device and visual gates

**Files:**
- Create: `.github/workflows/pwa-quality.yml`
- Modify: `tests/e2e/playwrightProjects.ts`
- Create: `tests/e2e/stability-smoke.spec.ts`
- Create: `apps/api/src/deploy/pwaQualityWorkflow.test.ts`
- Modify: `apps/web/public/sw.js`
- Create: `apps/web/public/offline.html`
- Create: `apps/web/src/features/app/offlineFallback.test.ts`

**Interfaces:**
- Produces: release smoke job, nightly broad matrix, screenshots/traces artifacts, and a designed same-origin offline navigation response.

- [ ] **Step 1: Write failing workflow and offline-fallback tests**

Require Chromium plus WebKit release smoke, nightly schedule, artifact upload on failure, audited widths, and `offline.html` in the app shell. Preserve the `/api/` network-only branch.

- [ ] **Step 2: Add a focused smoke spec**

Cover authenticated core route shells, horizontal overflow, visible primary controls, safe-area containment, and one keyboard-visible form. Keep broad screenshot/theme/Axe tests nightly.

- [ ] **Step 3: Add workflows and designed offline page**

Cache pnpm/Playwright browser dependencies, cap job duration, and upload only failure artifacts. Replace the service worker's plain-text 503 with cached `/offline.html`, incrementing the cache version.

- [ ] **Step 4: Verify and commit**

Run the smoke projects locally, service-worker tests, workflow tests, and full build.

Commit: `test: automate pwa stability checks`

### Task 8: Production validation and release

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`

**Interfaces:**
- Produces: one production release with verified recovery, monitoring, limits, and UI gates.

- [ ] **Step 1: Add the release note and increment the application version**

Use Russian title `Стабильность и резервное восстановление` and an English counterpart. Preserve all previous notes.

- [ ] **Step 2: Run complete local verification**

Run: `pnpm check`, `pnpm test`, `pnpm build`, focused Playwright smoke, `bash -n` for every changed shell script, Compose config validation, and `git diff --check`.

- [ ] **Step 3: Push and monitor deployment**

Wait for the quality and deploy jobs. On failure, inspect evidence and do not bypass the quality gate.

- [ ] **Step 4: Verify production recovery and observation**

Confirm exact commit, healthy containers, PWA/health/ready, all systemd timers, a new database backup, successful isolated restore, Kuma backup, external workflow, email test, disk/memory probe, and no new OOM/restart events.

- [ ] **Step 5: Final commit/state check**

Confirm the working tree is clean and the deployed marker equals the release commit.
