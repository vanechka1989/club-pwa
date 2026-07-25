# External Uptime Kuma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the production cutover from the application VPS to the dedicated Uptime Kuma VPS without allowing the old service to return during future deployments.

**Architecture:** The monitoring VPS owns Uptime Kuma, Caddy, TLS, persistent data, and a rotating local SQLite backup. The application deployment removes every runtime dependency on local Kuma while retaining its lightweight host-capacity monitor and PostgreSQL backup infrastructure.

**Tech Stack:** Docker Compose, Caddy, Uptime Kuma 2 rootless, systemd, Bash, Vitest

## Global Constraints

- Preserve the existing Uptime Kuma user, three monitors, history, and pinned image digest.
- Keep the old Docker volume until the new instance passes post-cutover verification.
- Do not stage or modify unrelated payment, membership, referral, or web UI work already present in the dirty worktree.
- Keep SSH, HTTP, and HTTPS as the only public firewall allowances on the monitoring VPS.

---

### Task 1: Remove local Kuma from application deployment

**Files:**
- Modify: `apps/api/src/deploy/securityConfig.test.ts`
- Modify: `apps/api/src/deploy/updateScript.test.ts`
- Modify: `apps/api/src/deploy/hostMonitoring.test.ts`
- Modify: `docker-compose.prod.yml`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/update-worker.sh`
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/check-host-capacity.sh`
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing production Compose service names and deployment health checks.
- Produces: an application deployment containing only `postgres`, `api`, `web`, and `caddy`, with no local Kuma listener or health dependency.

- [ ] **Step 1: Change deployment tests to require external Kuma**

Update the tests to assert that production Compose has no `uptime-kuma` service or data volume, Caddy has no port `8443` listener, full reconciliation starts only `postgres api web caddy`, deployment health checks cover API and PWA only, diagnostics omit Kuma, and the host probe checks only application services.

- [ ] **Step 2: Run focused tests and verify the expected failures**

Run: `pnpm --filter @club/api test -- src/deploy/securityConfig.test.ts src/deploy/updateScript.test.ts src/deploy/hostMonitoring.test.ts`

Expected: failures identify the existing Kuma service, listener, deployment references, and host-probe entry.

- [ ] **Step 3: Remove the obsolete local runtime references**

Delete the Kuma service and volume from production Compose, delete the `8443` Caddy site, simplify deployment health checks, update reconciliation and diagnostics service lists, remove Kuma from the host probe, and replace the obsolete `.env.example` comment with the external dashboard URL.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm --filter @club/api test -- src/deploy/securityConfig.test.ts src/deploy/updateScript.test.ts src/deploy/hostMonitoring.test.ts`

Expected: all focused tests pass.

### Task 2: Retire the obsolete application-host backup timer

**Files:**
- Modify: `apps/api/src/deploy/backupInfrastructure.test.ts`
- Modify: `deploy/install-backup-timer.sh`
- Delete: `scripts/backup-uptime-kuma-s3.sh`

**Interfaces:**
- Consumes: existing `install_operational_timers` deployment call.
- Produces: an idempotent timer installer that keeps database backup timers and disables/removes obsolete Kuma backup units.

- [ ] **Step 1: Change the timer tests**

Require the installer to disable `club-pwa-kuma-backup.timer`, remove both old Kuma unit files, omit Kuma timer installation, and continue installing PostgreSQL backup and restore-verification timers.

- [ ] **Step 2: Run the backup infrastructure test and verify it fails**

Run: `pnpm --filter @club/api test -- src/deploy/backupInfrastructure.test.ts`

Expected: failure shows the installer still creates and enables the Kuma backup timer.

- [ ] **Step 3: Implement idempotent retirement**

Remove Kuma unit generation and add `systemctl disable --now club-pwa-kuma-backup.timer` followed by removal of the old service and timer files before `daemon-reload`. Delete the obsolete local backup script.

- [ ] **Step 4: Run the backup infrastructure test and verify it passes**

Run: `pnpm --filter @club/api test -- src/deploy/backupInfrastructure.test.ts`

Expected: test passes while PostgreSQL timer assertions remain green.

### Task 3: Complete production cutover and verify

**Files:**
- Create remotely: `/opt/uptime-kuma/backup.sh`
- Create remotely: `/etc/systemd/system/uptime-kuma-backup.service`
- Create remotely: `/etc/systemd/system/uptime-kuma-backup.timer`
- Modify remotely: `/opt/club-pwa` through the normal deployment flow

**Interfaces:**
- Consumes: verified migrated SQLite database and external Docker stack.
- Produces: a healthy external dashboard with rotating daily backups and an application VPS with no running local Kuma container.

- [ ] **Step 1: Install a daily rotating SQLite backup on the monitoring VPS**

Use the container's bundled `sqlite3` online `.backup` command, store files under `/var/backups/uptime-kuma`, retain 30 daily snapshots, and fail the systemd unit on any backup error.

- [ ] **Step 2: Run repository verification**

Run focused tests, `pnpm check`, and `git diff --check`.

Expected: all commands exit successfully.

- [ ] **Step 3: Commit and deploy only migration files**

Commit only the deployment, test, and documentation files from this plan. Push the commit and run the existing production deployment workflow or server update worker.

- [ ] **Step 4: Verify application and external monitoring**

Confirm application health/readiness, external dashboard HTTPS, certificate validity, three fresh successful monitor heartbeats, healthy external containers, active backup timer, active application host monitor timer, and no obsolete Kuma backup timer.

- [ ] **Step 5: Remove the old container and image while retaining rollback data**

Remove the old Compose orphan container, remove the unused Kuma image, retain `club-pwa_uptime-kuma-data`, and report disk usage on both servers.
