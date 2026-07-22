# Stability Foundation Design

## Goal

Make Club PWA recoverable, externally observable, resource-bounded, and protected from visual regressions without replacing the current single-VPS architecture. The first stability package must reduce the highest-impact risks while keeping deployment and day-to-day operation simple.

## Current State and Risks

The production deployment already has health/readiness endpoints, container health checks, atomic deployment verification with image rollback, bounded Docker logs, a cleanup timer, a private Uptime Kuma dashboard, and broad Playwright coverage for Android, iPhone, tablet, landscape, keyboard, overflow, and accessibility cases.

The production audit found four remaining reliability gaps:

1. The PostgreSQL backup implementation exists, but `club-pwa-backup.timer` is not installed on the VPS, so nightly off-site backups are not guaranteed.
2. Uptime Kuma runs on the same VPS as Club PWA and cannot report a complete VPS or network outage by itself. It also has no configured delivery channel for alerts.
3. PostgreSQL, API, web, and Caddy have no explicit resource budgets. One abnormal process can consume enough memory or processes to destabilize the entire 2 GB VPS.
4. The deployment workflow does not run source checks, tests, or a production build before updating the server. The visual test suite exists but is not an automated release gate.

The server currently has approximately 1.1 GB available memory, 2 GB swap, and 5.9 GB free disk space with 69% disk usage. There are no failed systemd units. These figures are safe for incremental hardening but do not justify adding a heavy Prometheus/Grafana stack.

## Scope and Delivery Order

The work is divided into four independently verifiable stages:

1. Recovery: install and verify automatic database and Kuma backups.
2. Observation: add external smoke checks, actionable alerts, and host capacity checks.
3. Runtime protection: add measured container budgets and deployment quality gates.
4. Client quality: automate the existing PWA device and visual regression suite.

Each stage is deployed only after its tests pass and has a documented rollback. High-availability PostgreSQL, a second application VPS, and a full metrics platform are deliberately excluded from this package because they increase operational complexity and cost. They remain a future option if usage or uptime requirements outgrow one VPS.

## Recovery Architecture

### PostgreSQL backup

`deploy/install-backup-timer.sh` remains the source of truth for a persistent systemd timer. The regular deployment worker installs or refreshes the timer idempotently when backup-related files change, rather than relying on a one-time manual server command.

The timer runs once per night and invokes the existing `scripts/backup-postgres-s3.sh`. A successful job must:

- create a PostgreSQL custom-format dump;
- upload it to the configured private S3 bucket under `system/database-backups/`;
- verify the uploaded object metadata before treating the run as successful;
- retain 30 days of completed backups;
- write a small machine-readable status file containing the last success time, object key, size, and error summary.

The job must fail clearly when S3 is not configured. It must never print database or S3 credentials.

### Restore verification

A separate weekly timer verifies recovery, not merely archive creation. It downloads the newest completed backup and restores it into an isolated temporary PostgreSQL 16 container with no published ports and a temporary data directory. The verification checks that the restore completes and that essential application tables can be queried. Cleanup runs through a trap on success, failure, or interruption.

The verification never connects the temporary database to the production API and never restores into the production PostgreSQL instance. Its status is written separately from the nightly backup status.

### Kuma backup

The backup job uses the `sqlite3` binary already present in the rootless Kuma image and SQLite's online `.backup` command to produce a consistent snapshot without stopping monitoring. The snapshot and the non-secret Kuma configuration files are archived and uploaded to the same private S3 bucket under a separate `system/uptime-kuma-backups/` prefix with 30-day retention. Credentials remain supplied at runtime and are not copied into the archive.

## Observation and Alerts

### Internal monitoring

The existing Kuma monitors continue to check `Club PWA`, `API Health`, and `API Ready` every 60 seconds. Email notification delivery is configured with the production SMTP account and owner address already present in the protected server environment. Secrets are entered only into Kuma's private data volume and are never committed to Git.

Kuma alerts after two consecutive failures to reduce transient noise and sends a recovery message when a service returns. Certificate expiry monitoring remains enabled. Unsupported `.ru` domain-expiry checks are disabled to avoid repetitive warnings.

### External monitoring

A scheduled GitHub Actions workflow performs an independent public check from outside the VPS every five minutes. It validates:

- the PWA returns an accepted 2xx response;
- `/api/health` contains `"ok":true`;
- `/api/ready` contains `"ok":true`;
- TLS negotiation succeeds.

The workflow uses bounded timeouts and retries. A failure makes the workflow red and creates or updates one deduplicated GitHub issue; recovery closes the issue. This provides a no-new-account external baseline. A dedicated external monitoring provider or second VPS can later replace it without changing application code.

### Host capacity checks

A lightweight systemd probe checks disk usage, available memory, swap pressure, container health, and restart/OOM state. Thresholds are:

- disk warning at 75%, critical at 85%, emergency at 92%;
- memory warning when available memory stays below 256 MB;
- immediate critical state for an unhealthy production container or OOM kill.

The probe writes structured status and sends failures to a Kuma push monitor or the same owner email channel. It does not expose Docker's socket to Kuma and does not install a heavy metrics stack.

## Runtime Protection

Resource budgets are added to PostgreSQL, API, web, and Caddy using current measurements and conservative headroom. The combined hard limits must leave at least 384 MB for the host, and services keep bounded PID counts. Initial budgets are validated under the existing 100-client load workflow before production deployment; limits are raised if normal peak usage approaches 70% of a service budget.

The API receives a graceful shutdown window so in-flight HTTP requests and background jobs can finish before container termination. Database connection pooling, public request timeouts, and idempotency-sensitive operations are reviewed without altering payment, mailing, or upload semantics.

The deployment workflow gains a `quality` job that checks out the exact commit and runs dependency installation with a frozen lockfile, TypeScript checks, unit tests, and the production build. The production deploy job requires this job. Server-side health verification and rollback remain the final gate after containers start.

## PWA Display and Performance Protection

The existing Playwright project matrix remains the canonical device list. Automation is split by purpose:

- every release runs a focused Chromium/WebKit smoke set for the core profile, learning, chat, payment, and admin routes;
- a scheduled nightly workflow runs the broad device matrix, keyboard/viewport tests, accessibility checks, and visual screenshots;
- failures upload screenshots, traces, and a compact viewport report as workflow artifacts.

The workflow explicitly checks 320, 360, 390, 412, 768, 1024, and 1440 pixel widths plus Android landscape. It checks all supported themes, horizontal overflow, safe areas, modal containment, keyboard-visible forms, minimum tap targets, and WCAG AA violations covered by Axe.

Performance work is measurement-led. The build records main CSS/JavaScript sizes and fails only on regressions beyond an agreed budget, not on the current baseline. Heavy admin and media code remains lazy-loaded. A designed offline/reconnecting screen replaces the current plain-text navigation failure while API requests remain network-only to prevent stale writes.

## Security

- Backup and SMTP secrets remain only in the protected production environment and private service volumes.
- Backup objects remain private and encrypted by the configured S3 provider; signed download links stay short-lived.
- Scheduled dependency, secret, and container-image scans report findings without automatically mutating production.
- Kuma remains rootless, read-only, capability-free, and without Docker socket access.
- External workflows receive only the minimum GitHub permissions required to read contents and manage one deduplicated incident issue.
- No monitoring endpoint exposes customer, payment, authentication, or database details.

## Failure Handling and Rollback

- A failed backup or restore verification preserves the last known-good backup and sends an alert; retention cleanup never deletes the object currently being verified.
- Monitoring failures cannot block normal API traffic.
- Resource-limit changes are deployed one service at a time and reverted if health or load checks regress.
- CI workflow changes are removable without changing runtime behavior.
- Systemd installers are idempotent; disabling their timers stops the jobs without deleting existing backups.
- Database schema changes are not required for the stability foundation.

## Verification

Automated source tests assert timer installation, schedules, retention, secret-safe logging, isolated restore cleanup, external check timeouts, alert deduplication, resource budgets, and deployment job dependencies. Shell scripts pass `bash -n` and ShellCheck where available. Compose and Caddy configurations validate before deployment.

Before release, the full workspace check, unit tests, production build, focused PWA smoke suite, and 100-client load test pass. Production verification confirms the exact deployed commit, healthy containers, successful PWA/health/readiness responses, active timers, a recent S3 backup, a successful isolated restore, a persisted Kuma backup, working alert delivery, and a green external check.

## Success Criteria

The package is complete when:

1. Losing the production database volume can be recovered from a recently verified private backup.
2. A complete VPS outage is visible from outside the VPS within five minutes.
3. The owner receives failure and recovery notifications without watching the dashboard.
4. One runaway container cannot consume all host resources under the validated load profile.
5. A commit cannot deploy unless checks, tests, and build pass.
6. Core PWA screens remain free of overflow, overlap, keyboard obstruction, and major accessibility regressions across the audited device matrix.
