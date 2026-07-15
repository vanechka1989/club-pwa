# Resilient Production Deploy Design

## Goal

Make production updates survive SSH disconnects, rebuild only affected services, avoid unnecessary API restarts, and record the commit that was actually verified in production.

## Architecture

`deploy/update.sh` becomes a small launcher. On systemd hosts it starts `deploy/update-worker.sh` as a transient `club-pwa-deploy.service`; the service continues even if the initiating SSH session disappears. The launcher can either return immediately with `DEPLOY_ASYNC=1` or wait for the systemd unit and return its final status. Hosts without systemd run the worker inline as a compatibility fallback.

The worker owns the deployment lock, pulls `main`, reads `/var/lib/club-pwa-deploy/deployed-commit`, and compares that verified commit with the new target. It never treats a successful `git pull` as a successful deployment. The marker is updated atomically only after container replacement and the public health check succeed.

## Selective service updates

- Changes under `apps/web` rebuild and replace only `web` with `docker compose up -d --no-deps web`.
- Changes under `apps/api` rebuild `api`, run migrations from that same image, and replace only `api`.
- Changes under `packages/shared` or root dependency/build files rebuild both application services.
- Changes to `docker-compose.prod.yml` perform a full application reconciliation.
- Changes limited to docs, tests, workflows, or deployment scripts require no container rebuild; after validation the deployed marker advances.
- `DEPLOY_FORCE=1` rebuilds both application services without cache.

## API and migration image

`api` builds and tags `club-pwa-api:latest`. `migrate` references the same image and no longer has its own build block. This removes the duplicate 804 MB API build while preserving the existing migration command and environment.

## State, logs, and failure handling

Deployment state is stored under `/var/lib/club-pwa-deploy`:

- `deployed-commit` — last commit that passed health verification;
- `status.env` — current phase, target commit, affected services, start/end timestamps, and result;
- systemd journal for `club-pwa-deploy.service` — durable command output.

The worker writes status atomically. A failed build, migration, container start, or health check leaves `deployed-commit` unchanged, so the next run retries the same target. Existing containers remain running during image compilation. Only affected services are replaced.

## Resource protection

`deploy/ensure-swap.sh` creates a persistent 2 GiB `/swapfile` only when the host has less than 4 GiB RAM and no active swap. It is idempotent and can be disabled with `DEPLOY_SWAP_SIZE_GB=0`. After a successful deployment, dangling images older than 72 hours are pruned. Buildx is installed by the server installer and checked by the worker; a missing plugin produces a warning rather than breaking an update.

## Verification

Source-level regression tests assert launcher detachment, verified-commit semantics, selective service commands, one API build, swap safeguards, workflow timeouts, and release metadata. Production verification checks the systemd unit, state files, deployed commit, container creation times, public health, live application version, and service-worker cache.

