# Uptime Kuma Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a private, hardened Uptime Kuma dashboard with three Club PWA monitors and persistent history.

**Architecture:** Add the digest-pinned rootless Kuma image to the production Compose network without host or Docker-socket access. Publish it only through a dedicated TLS listener in Caddy, then initialize its administrator and HTTPS monitors through the product UI.

**Tech Stack:** Docker Compose, Caddy, Uptime Kuma 2.3.2 rootless, Vitest, GitHub Actions deployment, SQLite named volume.

## Global Constraints

- Dashboard URL is `https://club2.myn8nservertest.ru:8443`.
- The dashboard is authenticated and no public status page is created.
- The Kuma container receives no Docker socket, application secrets, or database access.
- Kuma data uses a local named volume with POSIX file locking.
- Monitors check the public PWA, `/api/health`, and `/api/ready` every 60 seconds.

---

### Task 1: Production monitoring contract

**Files:**
- Modify: `apps/api/src/deploy/securityConfig.test.ts`
- Modify: `apps/api/src/deploy/updateScript.test.ts`

**Interfaces:**
- Consumes: production Compose and Caddy source files.
- Produces: regression assertions for the Kuma service, ingress, and deployment lifecycle.

- [ ] Add failing assertions for `louislam/uptime-kuma:2-rootless@sha256:a23b9d0029e6f1bc4a0fea0f3ee306d51f43216cd9f8115f8d84d146e9411e4c`, `uptime-kuma-data`, port 8443, capability dropping, resource limits, and the absence of `docker.sock`.
- [ ] Run `pnpm --filter @club/api test -- securityConfig.test.ts updateScript.test.ts` and confirm the new assertions fail.
- [ ] Keep the test focused on externally verifiable configuration strings rather than implementation ordering that Compose does not guarantee.

### Task 2: Hardened Kuma service and TLS ingress

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/update-worker.sh`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the existing `default-logging` anchor and Caddy network.
- Produces: Compose service `uptime-kuma`, named volume `uptime-kuma-data`, and HTTPS listener on 8443.

- [ ] Add the rootless digest-pinned service with `/app/data`, `read_only`, `/tmp` tmpfs, `no-new-privileges`, `cap_drop: ALL`, `mem_limit: 384m`, `cpus: 0.50`, and `pids_limit: 256`.
- [ ] Expose only port 3001 to the Compose network; do not publish it from the Kuma container.
- [ ] Publish Caddy port 8443 and add `https://{$PUBLIC_DOMAIN}:8443` with WebSocket-compatible `reverse_proxy uptime-kuma:3001` and security headers.
- [ ] Include `uptime-kuma` in full deployment reconciliation and remote failure diagnostics.
- [ ] Run the focused tests and `docker compose -f docker-compose.prod.yml config` on a Docker host; expect success.

### Task 3: Release and production initialization

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: the existing version and release-note contract.
- Produces: the next Club PWA release containing server monitoring.

- [ ] Increment the application version and add Russian and English release notes for monitoring.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check`; expect all commands to pass.
- [ ] Commit and push `main`, then wait for the production deployment workflow.
- [ ] Initialize the Kuma administrator without storing the password in Git and create `Club PWA`, `API Health`, and `API Ready` monitors with 60-second intervals.
- [ ] Verify the final server commit, `/api/health`, `/api/ready`, dashboard HTTPS response, Kuma container state, persistent volume, service-worker revision, and recent logs.
