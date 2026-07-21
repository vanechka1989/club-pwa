# Application Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a measurable performance, mobile-focus, dependency-security, and operational-reliability improvement without changing business behavior.

**Architecture:** Lazy-load section roots, isolate portal task screens through a shared registry, reuse cached S3 runtime resources with explicit invalidation, and harden the existing Docker deployment. Keep database aggregation rewrites in a separate follow-up release.

**Tech Stack:** Vue 3, Vite, TypeScript, Vitest, Playwright, Bun, Hono, AWS SDK v3, Docker Compose, PostgreSQL.

## Global Constraints

- Preserve existing routes, API contracts, permissions, and visual themes.
- Support 320, 390, 768, 1024, and 1440 pixel widths.
- Do not cache authenticated API responses in the service worker.
- Every behavior change starts with a failing test.
- Production deployment must pass health and readiness checks and retain rollback capability.

---

### Task 1: Portal task-screen isolation

**Files:**
- Create: `apps/web/src/features/app/taskLayerRegistry.ts`
- Create: `apps/web/src/features/app/taskLayerRegistry.test.ts`
- Modify: `apps/web/src/features/app/TaskScreen.vue`
- Modify: `apps/web/src/App.vue`

**Interfaces:**
- Produces: `portalTaskLayerDepth: Ref<number>`, `registerPortalTaskLayer(): () => void`, and `hasPortalTaskLayer: ComputedRef<boolean>`.

- [ ] Write tests proving registration is reference-counted and cleanup is idempotent.
- [ ] Run the focused test and confirm it fails because the registry does not exist.
- [ ] Implement the registry and integrate it with `TaskScreen` mount/unmount.
- [ ] Blur background focus and focus the task-screen back button after mount.
- [ ] Mark the underlying application shell inert while a portal task screen is active.
- [ ] Run unit and mobile keyboard tests.

### Task 2: Route-level section chunks

**Files:**
- Create: `apps/web/src/features/app/asyncSections.test.ts`
- Modify: `apps/web/src/App.vue`

**Interfaces:**
- Consumes the existing section component props and emitted events unchanged.

- [ ] Write a source-level regression test requiring dynamic imports for six authenticated section roots.
- [ ] Run it and confirm static imports fail the test.
- [ ] Replace static imports with `defineAsyncComponent(() => import(...))`.
- [ ] Build the web app and verify separate hashed chunks are emitted.

### Task 3: Reusable S3 runtime resources

**Files:**
- Create: `apps/api/src/storage/runtimeResourceCache.ts`
- Create: `apps/api/src/storage/runtimeResourceCache.test.ts`
- Modify: `apps/api/src/storage/s3.ts`
- Modify: `apps/api/src/routes/admin.ts`

**Interfaces:**
- Produces: `createRuntimeResourceCache<T>({ load, ttlMs, dispose? })` with `get()` and `invalidate()`.
- Produces: `invalidateS3RuntimeCache(): void`.

- [ ] Write tests for concurrent reuse, TTL expiry, invalidation, disposal, and rejected-load retry.
- [ ] Run them and confirm failure because the cache module does not exist.
- [ ] Implement the minimal reusable cache.
- [ ] Cache S3 config for 60 seconds and clients by effective target config.
- [ ] Invalidate after a successful administrator storage-settings update.
- [ ] Run API storage and admin tests.

### Task 4: Dependency and container hardening

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/Dockerfile`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- Overrides `shell-quote` with `1.9.0`.
- Applies JSON-file log limits of 10 MB and 3 files per production service.

- [ ] Add the dependency override and regenerate the lockfile.
- [ ] Run the production dependency audit.
- [ ] Convert the API Dockerfile to dependency and runtime stages using `COPY --chown`.
- [ ] Add bounded logging to production services.
- [ ] Build the API image and run its healthcheck locally or in the deployment flow.

### Task 5: Backup, release, and production verification

**Files:**
- Create: `scripts/backup-postgres-s3.sh`
- Create: `docs/operations/backups.md`
- Modify: application version/release-note files used by the existing release workflow.

**Interfaces:**
- Backup script consumes `DATABASE_URL`, `BACKUP_S3_URI`, and optional `BACKUP_RETENTION_DAYS`.

- [ ] Add a shell validation test or dry-run mode for required configuration and artifact naming.
- [ ] Implement compressed dump, integrity check, S3 upload, and safe local retention.
- [ ] Document timer installation and a weekly restore drill.
- [ ] Run full tests, checks, builds, responsive audits, and dependency audit.
- [ ] Update the application version and release notes.
- [ ] Commit, deploy with the existing health-checked workflow, and verify production `/health`, `/ready`, assets, and logs.
