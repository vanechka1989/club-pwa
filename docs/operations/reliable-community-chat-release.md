# Reliable community chat release 5.79

This runbook is a blocking checklist for the first production release of the reliable community chat. Do not push a deployment past a failed or unverified item.

## Before pushing the release SHA

1. Run `pnpm test:release`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:release` separately. All **11** configured PostgreSQL, versioned-primary/reserve-S3, and ClamAV suites in the external community gate must run with zero unexpected skips on the GitHub runner. This count includes the PostgreSQL concurrent-initial-S3-commit test.
2. Confirm the production host has at least **8 GiB** of physical RAM and at least **1 GiB MemAvailable** immediately before deployment. Swap does not replace either requirement. The persistent Compose hard limits total **6.5 GiB**: PostgreSQL 512 MiB, API 512 MiB, worker 1 GiB, web 128 MiB, Caddy 128 MiB, Redis 256 MiB, and ClamAV 4 GiB. Migration and upload-permission containers are bounded transient work in addition to this total.
3. Apply and read back the required S3 lifecycle configuration on the primary bucket and, when configured, the reserve bucket. The automated `s3-lifecycle` phase requires exactly one unconditional pending-expiry rule at one day, one candidate-expiry rule at seven days, and one multipart-abort rule at one day. An enabled rule overlapping `community/` may contain only that rule's single allowlisted action: transitions, noncurrent transitions/expiration, combined actions, expired-delete-marker actions, and unknown future actions are rejected. Additional disabled rules are harmless and allowed. The gate requires versioning to be enabled and runs a disposable all-version deletion probe with the actual production credentials: two versions and a delete marker must be listed, deleted by `VersionId`, and confirmed absent. It fails closed for lifecycle drift, missing versioning, or insufficient IAM permissions on either target.
   Runtime credential rotation must keep the exact endpoint, region, bucket, and reserve topology and passes the same gate. Any physical target move is a separate offline migration release; it must not be attempted through the admin API.
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
backup-after-quiesce
migrate
community-cleanup-dry-run
restart/reconcile
dependency health, public `/api/health`, public `/api/ready`, and rendered PWA health
```

The `backup-before-migration` phase validates the dump/upload path. Immediately before migration, `quiesce-api-worker` stops API and worker and verifies that neither is still running; `backup-after-quiesce` then creates and verifies the authoritative restore point with no writer window before DDL. Any failure stops deployment before `drizzle-kit migrate` runs. Crossing the barrier makes schema-incompatible API/worker images invalid rollback targets. Retain both backup keys from the log, use the post-quiesce key for migration recovery, and confirm the most recent isolated restore verification is successful.

Migrations `0063_reliable_community_chat` through `0069_community_object_hot_queue` are forward-only and remain compatible with the previous web client. API and worker may run only against the schema revision they require:

- `0063_reliable_community_chat` adds read/notification/mention tables, nullable message lifecycle columns, attachment scan columns with safe defaults, and indexes;
- `0064_community_message_reliability` adds nullable idempotency and cleanup-claim columns plus an index;
- `0065_community_upload_manifests` adds the upload manifest table and extends only its new status constraint;
- `0066_community_media_candidates` adds the media candidate ledger and indexes;
- `0067_community_chat_privacy_fencing` backfills durable read tuples, keeps transitional old-image read writes synchronized with a trigger, removes the deleting read-pointer foreign key, adds lifecycle fences, a source-independent object-deletion ledger, bounded purge intents, access versions, and the community notification outbox. It removes only unrecoverable legacy community notifications during backfill and deduplicates existing community deliveries before creating their unique index.
- `0068_community_object_convergence` adds persistent per-target object generations and irreversible tombstones, including forward backfills for terminal manifests, media candidates, and pending deletion-ledger keys.
- `0069_community_object_hot_queue` adds the bounded hot-reconciliation deadline, cold-tombstone marker, partial due-work index, and bounded stale-attachment publication index. Existing tombstones receive a required final audit before becoming cold.

The tombstone worker uses oldest-first PostgreSQL row leases split across 16 shards. One round leases at most 64 targets and has a 15-second provider deadline; up to 35 continuous rounds reserve eight minutes 45 seconds of drain time after the five-minute audit delay and one-minute scheduler allowance, leaving a final 15-second database/dispatch margin. The minimum modeled service rate is 256 targets/minute and the admission headroom is 2,176 hot targets. Privacy deletion and recovery tombstones are always accepted. When projected drain time or oldest-due latency consumes the 15-minute budget, new provider publications fail closed and the worker emits the capacity/SLA alert; operators must scale or restore provider throughput rather than discard tombstones. The `/api/metrics` tombstone snapshot exposes hot/due counts, oldest due time, estimated drain time, service rate, capacity, backpressure events, and `slaAtRisk`. Cold tombstones remain durable and are never removed by this worker.

The first four migrations do not drop or rename application tables/columns, truncate rows, or delete data. Migration `0067` intentionally drops only the `last_read_message_id` foreign-key constraint (the column remains), and may delete legacy community notification rows that cannot be tied to a live topic/access version or duplicate another delivery. Do not reverse the schema during an incident and do not restart a pre-privacy API or worker after migration has begun. Before the release window, separately check that existing `club_message_attachments.object_key` values are unique because `0063` creates a unique index.

The `community-cleanup-dry-run` phase executes separately capped, read-only counts after migration for immediately reclaimable and stale manifests, retryable and stale media candidates, quarantined documents, due/stale object-deletion jobs, and pending bulk purge intents. Each query is capped at 1001 rows and the summary reports `deletesPerformed: 0`. Review the JSON in deployment logs; non-zero counts are handled by bounded workers and are not themselves proof of data loss. The staging gate must also list `community/quarantine/` and `community/final/` in primary and reserve storage and prove that every retained key has a live source row or durable deletion-ledger entry.

Before `quiesce-api-worker`, a failure can restore the previous `latest` tags. After that barrier, recovery reads the actual migration revision and schema capabilities. It restores the legacy API only for a fully legacy schema, keeps the candidate only for the complete current schema, and leaves API/worker stopped for an unknown or partial schema. Recovery then recreates Caddy and verifies dependencies, schema state, liveness, readiness, and PWA health where API recovery is allowed. Rollback image tags are retained after every failed deployment and are removed only after the new release is verified and its commit is recorded as successful.

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
