# Resilient Production Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, selective production deployment pipeline that survives SSH disconnects and records only health-verified commits.

**Architecture:** A systemd-backed launcher delegates to a locked worker. The worker calculates affected services from the last verified commit, builds and replaces only those services, and atomically records success after health verification.

**Tech Stack:** Bash, systemd, Docker Compose, Git, Vitest, GitHub Actions.

## Global Constraints

- Existing production data volumes must not be recreated or deleted.
- Web-only updates must not restart API, PostgreSQL, or Caddy.
- A failed deployment must not advance `deployed-commit`.
- The deployment must remain alive after the initiating SSH session disconnects.
- Full verification and public health checks are mandatory before reporting completion.

---

### Task 1: Deployment contract tests

**Files:**
- Modify: `apps/api/src/deploy/updateScript.test.ts`

**Interfaces:**
- Consumes: deployment shell scripts and production compose/workflow files as text.
- Produces: regression assertions for launcher, worker, state marker, service selection, swap, and shared API image.

- [ ] Add assertions that `update.sh` invokes the worker through `systemd-run`, supports `DEPLOY_ASYNC`, and never performs `git pull` itself.
- [ ] Add assertions that `update-worker.sh` compares against `deployed-commit`, writes it only after `wait_for_health`, and uses `--no-deps` for selective service replacement.
- [ ] Add assertions that a web-only path never runs migrations or replaces API.
- [ ] Add assertions that `api` and `migrate` use `club-pwa-api:latest` and only `api` owns a build block.
- [ ] Add assertions for idempotent swap creation and post-success dangling-image cleanup.
- [ ] Run `pnpm --filter @club/api test -- src/deploy/updateScript.test.ts` and confirm the new assertions fail because the files/behavior do not yet exist.

### Task 2: Durable launcher and observable status

**Files:**
- Modify: `deploy/update.sh`
- Create: `deploy/status.sh`

**Interfaces:**
- Consumes: `DEPLOY_DIR`, `DEPLOY_ASYNC`, `DEPLOY_FORCE`.
- Produces: transient `club-pwa-deploy.service` and readable `/var/lib/club-pwa-deploy/status.env`.

- [ ] Replace the inline deployment with a systemd launcher that starts `update-worker.sh` in a transient service.
- [ ] Preserve environment flags, return immediately for `DEPLOY_ASYNC=1`, and otherwise wait for the unit's final exit status.
- [ ] Add `status.sh` to print state, active unit status, and recent journal output without exposing `.env` values.
- [ ] Run the focused deploy test and confirm launcher assertions pass while worker assertions remain failing.

### Task 3: Selective verified deployment worker

**Files:**
- Create: `deploy/update-worker.sh`
- Create: `deploy/ensure-swap.sh`

**Interfaces:**
- Consumes: repository target commit and `/var/lib/club-pwa-deploy/deployed-commit`.
- Produces: selected `web`/`api`/full deployment, atomic state updates, and verified commit marker.

- [ ] Add an exclusive flock in the worker and atomic status-file writes for pull, build, migration, restart, health, success, and failure phases.
- [ ] Pull with fast-forward only, validate the stored commit, and calculate the changed file set.
- [ ] Classify changes into web, API, both, full compose reconciliation, or source-only.
- [ ] Build only selected services, run migration only for API, and replace selective services with `--no-deps`.
- [ ] Call `ensure-swap.sh`, run health verification, write `deployed-commit` only after success, and prune dangling images older than 72 hours.
- [ ] Run the focused deploy test and confirm all deployment assertions pass.

### Task 4: Single API image and automation settings

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `deploy/server-install.sh`

**Interfaces:**
- Consumes: `club-pwa-api:latest` built by the `api` service.
- Produces: migration reuse of the API image, resilient SSH timeouts, and Buildx installation for new servers.

- [ ] Tag the API build as `club-pwa-api:latest` and make `migrate` reference that image without its own build block.
- [ ] Add SSH keepalive and an unlimited command timeout to the GitHub deployment step while retaining the worker's result reporting.
- [ ] Install `docker-buildx-plugin` in supported server installation paths.
- [ ] Run focused deployment tests and `docker compose -f docker-compose.prod.yml config`.

### Task 5: Release and complete verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: application version `4.55` and service-worker cache `club-pwa-v154`.

- [ ] Add release notes describing reliable background deployment and faster selective updates.
- [ ] Run focused tests, `pnpm check`, `pnpm test`, `pnpm build`, `git diff --check`, and shell syntax checks.
- [ ] Commit and push `main`.
- [ ] Install Buildx and enable the 2 GiB swap file on production.
- [ ] Start the new asynchronous deploy, inspect it through `deploy/status.sh`, and verify deployed commit, public health, version `4.55`, cache `v154`, and container restart scope.

