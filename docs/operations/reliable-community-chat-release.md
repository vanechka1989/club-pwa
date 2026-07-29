# Reliable community chat release 5.79

This runbook is a blocking checklist for the first production release of the reliable community chat. Do not push a deployment past a failed or unverified item.

## Before pushing the release SHA

1. Run `pnpm test:release`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:release` separately. The external community gate must execute 45 tests with zero skips on the GitHub runner.
2. Confirm the production host has at least **8 GiB** of physical RAM and at least **1 GiB MemAvailable** immediately before deployment. Swap does not replace either requirement. The persistent Compose hard limits total **6.5 GiB**: PostgreSQL 512 MiB, API 512 MiB, worker 1 GiB, web 128 MiB, Caddy 128 MiB, Redis 256 MiB, and ClamAV 4 GiB. Migration and upload-permission containers are bounded transient work in addition to this total.
3. Apply and read back the required S3 lifecycle configuration on the primary bucket and, when configured, the reserve bucket. The automated `s3-lifecycle` phase requires exactly one unconditional pending-expiry rule at one day, one candidate-expiry rule at seven days, and one multipart-abort rule at one day. It also records each bucket's versioning state and the corresponding complete-deletion mode. It fails closed for missing, disabled, duplicate, conditional, broader, additional, or wrong-delay community rules, or when versioning cannot be read.
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
uploads-permissions
quiesce-api-worker
migrate
community-cleanup-dry-run
restart/reconcile
dependency health, public `/api/health`, public `/api/ready`, and rendered PWA health
```

The `backup-before-migration` phase creates a custom-format PostgreSQL dump, uploads it below `system/database-backups/`, and validates the uploaded object size. Any failure stops deployment before `drizzle-kit migrate` runs. Immediately before migration, `quiesce-api-worker` stops the legacy API and worker and verifies that neither is still running. Crossing that barrier makes every pre-`0067` API/worker image an invalid rollback target. Retain the backup key from the log and confirm the most recent isolated restore verification is successful.

Migrations `0063_reliable_community_chat` through `0067_community_chat_privacy_fencing` are forward-only and remain compatible with the previous web client. The previous API and worker are not allowed to run after the `0067` privacy barrier:

- `0063_reliable_community_chat` adds read/notification/mention tables, nullable message lifecycle columns, attachment scan columns with safe defaults, and indexes;
- `0064_community_message_reliability` adds nullable idempotency and cleanup-claim columns plus an index;
- `0065_community_upload_manifests` adds the upload manifest table and extends only its new status constraint;
- `0066_community_media_candidates` adds the media candidate ledger and indexes;
- `0067_community_chat_privacy_fencing` backfills durable read tuples, keeps transitional old-image read writes synchronized with a trigger, removes the deleting read-pointer foreign key, adds lifecycle fences, a source-independent object-deletion ledger, bounded purge intents, access versions, and the community notification outbox. It removes only unrecoverable legacy community notifications during backfill and deduplicates existing community deliveries before creating their unique index.

The first four migrations do not drop or rename application tables/columns, truncate rows, or delete data. Migration `0067` intentionally drops only the `last_read_message_id` foreign-key constraint (the column remains), and may delete legacy community notification rows that cannot be tied to a live topic/access version or duplicate another delivery. Do not reverse the schema during an incident and do not restart a pre-privacy API or worker after migration has begun. Before the release window, separately check that existing `club_message_attachments.object_key` values are unique because `0063` creates a unique index.

The `community-cleanup-dry-run` phase executes separately capped, read-only counts after migration for immediately reclaimable and stale manifests, retryable and stale media candidates, quarantined documents, due/stale object-deletion jobs, and pending bulk purge intents. Each query is capped at 1001 rows and the summary reports `deletesPerformed: 0`. Review the JSON in deployment logs; non-zero counts are handled by bounded workers and are not themselves proof of data loss. The staging gate must also list `community/quarantine/` and `community/final/` in primary and reserve storage and prove that every retained key has a live source row or durable deletion-ledger entry.

Before `quiesce-api-worker`, a failure can restore the previous `latest` tags. After that privacy barrier, recovery deliberately keeps the candidate API image, force-recreates the candidate API/worker, and may restore only the previous web image. It then recreates Caddy and verifies dependency, liveness, readiness, and PWA health. If the privacy-compatible API cannot become healthy, leave the old API/worker stopped and roll forward with a corrected compatible image; availability must not be recovered by violating the deletion or revocation fence. Rollback image tags are retained after every failed deployment and are removed only after the new release is verified and its commit is recorded as successful.

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
