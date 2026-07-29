# Reliable community chat release 5.79

This runbook is a blocking checklist for the first production release of the reliable community chat. Do not push a deployment past a failed or unverified item.

## Before pushing the release SHA

1. Run `pnpm test:release`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:release` separately. The external community gate must execute 31 tests with zero skips on the GitHub runner.
2. Confirm the production host has at least **8 GiB** of physical RAM and at least **1 GiB MemAvailable** immediately before deployment. Swap does not replace either requirement. The persistent Compose hard limits total **6.5 GiB**: PostgreSQL 512 MiB, API 512 MiB, worker 1 GiB, web 128 MiB, Caddy 128 MiB, Redis 256 MiB, and ClamAV 4 GiB. Migration and upload-permission containers are bounded transient work in addition to this total.
3. Apply and read back the required S3 lifecycle configuration on the primary bucket and, when configured, the reserve bucket. The automated `s3-lifecycle` phase fails closed when a bucket is unavailable or a required rule is absent.
4. Confirm ClamAV can load signatures with its persistent volume and becomes healthy. API readiness intentionally remains independent, but this deployment gate requires PostgreSQL, Redis, and ClamAV to be healthy before and after reconciliation.

Useful host checks:

```bash
free -h
awk '/MemTotal:|MemAvailable:/ { print }' /proc/meminfo
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml ps postgres redis clamav api worker web caddy
```

## Backup and migration order

`deploy/update-worker.sh` enforces this order for API and full reconciliations:

```text
release-dependencies
s3-lifecycle
backup-before-migration
migrate
community-cleanup-dry-run
restart/reconcile
dependency and application health
```

The `backup-before-migration` phase creates a custom-format PostgreSQL dump, uploads it below `system/database-backups/`, and validates the uploaded object size. Any failure stops deployment before `drizzle-kit migrate` runs. Retain the backup key from the log and confirm the most recent isolated restore verification is successful.

Migrations `0063_reliable_community_chat` through `0066_community_media_candidates` are forward-only and old-client compatible:

- `0063` adds read/notification/mention tables, nullable message lifecycle columns, attachment scan columns with safe defaults, and indexes;
- `0064` adds nullable idempotency and cleanup-claim columns plus an index;
- `0065` adds the upload manifest table and extends only its new status constraint;
- `0066` adds the media candidate ledger and indexes.

They do not drop or rename application tables/columns, truncate rows, or delete data. Rolling back application images leaves these additions in place; do not attempt to reverse the schema during an incident. Before the release window, separately check that existing `club_message_attachments.object_key` values are unique because `0063` creates a unique index.

The `community-cleanup-dry-run` phase executes bounded read-only counts after migration. It reports expired unattached manifests, retryable media candidates, and quarantined documents with `deletesPerformed: 0`. Review the JSON in deployment logs; the phase must complete successfully, but non-zero counts are handled by the bounded worker and are not themselves proof of data loss.

## Workflow and production acceptance

For the exact pushed SHA, require successful workflows named `Deploy to VPS`, `PWA device regression`, and `Публикация образов шаблонного клуба`. Do not accept a run for another SHA.

After deployment, verify read-only endpoints and artifacts:

```text
GET /             -> 200
GET /api/health   -> {"ok":true}
GET /api/ready    -> {"ok":true}
GET /sw.js        -> contains club-pwa-v251
production JS     -> contains 5.79 and Надёжный и удобный клубный чат
```

Using an existing authenticated account, inspect topic unread/settings responses, bounded search context, and document scanner health. Do not create chat messages or upload files solely for smoke testing. Deployment remains blocked if RAM, S3 lifecycle, the verified backup, migrations, cleanup dry-run, ClamAV/Redis/PostgreSQL health, exact-SHA workflows, or production read-only checks are not confirmed.
