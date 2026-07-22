# Automatic Storage Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded daily server cleanup and visible storage health to the admin server panel.

**Architecture:** A root-owned systemd timer runs a narrowly scoped shell script and writes an atomic non-secret status file. The API reads that file through a read-only bind mount and the existing admin endpoint returns a typed summary rendered by `AdminServerPanel.vue`.

**Tech Stack:** Bash, systemd, Docker Compose, TypeScript, Zod, Vue 3, Vitest.

## Global Constraints

- Build cache maximum is 2 GB.
- Dangling images are retained for 7 days.
- Journal maximum is 150 MB.
- Warning thresholds are 70%, 85%, and 92%.
- Volumes, containers, PostgreSQL data, uploads, and S3 objects are never pruned.
- The API receives read-only status data and no Docker socket.

---

### Task 1: Safe host maintenance service

**Files:**
- Create: `scripts/maintain-host-storage.sh`
- Create: `deploy/install-storage-maintenance.sh`
- Modify: `deploy/update-worker.sh`
- Modify: `scripts/check-host-capacity.sh`
- Test: `apps/api/src/deploy/hostMonitoring.test.ts`

**Interfaces:**
- Produces `/var/lib/club-pwa-maintenance/storage.env` with status and bounded metrics.
- Produces systemd units `club-pwa-storage-maintenance.service` and `.timer`.

- [ ] Write failing infrastructure assertions for `flock`, atomic status output, 2 GB BuildKit cache, seven-day dangling image retention, 150 MB journals, 04:20 timer, OnFailure alert, 70% warning, and forbidden broad/volume/container prune commands.
- [ ] Run `pnpm --filter @club/api test -- hostMonitoring.test.ts` and confirm the new assertions fail.
- [ ] Implement the shell script and installer, then wire the installer into `deploy/update-worker.sh`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Typed maintenance status in the admin API

**Files:**
- Create: `apps/api/src/operations/hostMaintenanceStatus.ts`
- Create: `apps/api/src/operations/hostMaintenanceStatus.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `docker-compose.prod.yml`
- Modify: `docker-compose.scale.yml`

**Interfaces:**
- Produces `readHostMaintenanceStatus(path): Promise<AdminStorageMaintenance | null>`.
- Extends `AdminServerStatus` with nullable `storageMaintenance`.

- [ ] Write failing parser tests for a valid status file, a missing file, malformed numbers, excessive values, and failure status.
- [ ] Run the focused API test and confirm it fails because the parser is absent.
- [ ] Implement the allowlisted parser and add the shared Zod schema.
- [ ] Mount `/var/lib/club-pwa-maintenance:/app/host-maintenance:ro` without mounting the Docker socket and return the status from `buildAdminServerStatus()`.
- [ ] Run shared/API checks and focused tests.

### Task 3: Storage health card and release

**Files:**
- Modify: `apps/web/src/features/admin/AdminServerPanel.vue`
- Create: `apps/web/src/features/admin/adminStorageMaintenance.test.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes `status.disk` and `status.storageMaintenance`.
- Shows a responsive storage card with no maintenance controls.

- [ ] Write failing UI assertions for the progress bar, free-space copy, latest cleanup, reclaimed bytes, storage categories, warning class, and mobile single-column layout.
- [ ] Implement the storage card and split the old combined memory/disk metric into a memory metric plus the dedicated card.
- [ ] Increment the app version and service-worker cache with a release note.
- [ ] Run focused UI tests, then `pnpm check`, `pnpm test`, `pnpm build`, and the release E2E suite.
- [ ] Commit, push `main`, wait for deployment, run maintenance once, and verify production health and disk status.
