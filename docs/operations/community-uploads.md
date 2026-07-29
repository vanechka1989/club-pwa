# Community upload operations

Community upload objects use private S3 prefixes. `community/pending/` is writable only through short-lived upload capabilities and is never served. The API conditionally copies the verified ETag to `community/quarantine/` or `community/final/`, then removes staging. Media normalization first writes a lease-unique object below `community/candidates/`; only the worker that durably fences the manifest may copy that object to `community/final/`. Publication uses short database compare-and-swap phases around bounded S3 work. Terminal cleanup creates irreversible PostgreSQL tombstones for every object key and configured target before deletion. Each tombstone remains in the indexed hot queue for 30 minutes, including separated absence proofs and a final proof after the uncertainty window, then becomes a permanent cold fence that is excluded from polling but still rejects every future publication for that key. Documents remain URL-less in quarantine until ClamAV reports clean; infected or cleanup-pending files never receive a read URL.

Legacy multipart voice/image publications use a five-minute database lease, longer than both the two-minute application I/O deadline and the two-minute SDK socket timeout. If a process disappears after the database plan, after an S3 write, or midway through a gallery, recovery locks the publication group, fences the parent message and every attachment, captures every gallery key in the deletion ledger, and creates all target tombstones in the same transaction. The 30-minute hot window starts again at that fence, providing a 15-times margin over the enforced provider-call bound. The external release gate exercises these three boundaries by terminating a separate process and proving that every version and delete marker disappears from versioned primary and reserve buckets.

The hot queue is split into 16 deterministic shards and can reconcile 1,344 target rows (672 keys when both primary and reserve are configured) within a proven 15-minute worst-case late-write SLA: a five-minute audit interval, one-minute worker scheduling allowance, and at most nine minutes for shard-fragmented provider work at 64 concurrent 15-second deadlines. Shards dispatch serially so the global deadline gate is never over-queued; the capacity proof includes the worst 15 partially filled shard waves. The 30-minute hot window exceeds that SLA. Above 1,344 hot target rows the API rejects new provider publications with `community_object_reconciliation_backpressure` until pressure clears. `/metrics` exposes hot/due counts, oldest due work, estimated processing time, SLA risk, capacity, and backpressure events; the worker also emits `community object tombstone capacity alert`. Page immediately on `slaAtRisk`, sustained backpressure, or an oldest-due age approaching 15 minutes.

Configure an S3 lifecycle rule on both storage buckets with `AbortIncompleteMultipartUpload` after one day. Also expire unreferenced `community/pending/` objects after one day and every `community/candidates/` object after seven days as defense in depth. Published attachments always live below `community/final/`, so the candidate-prefix rule cannot delete a winner. The API abort, expiry, and candidate-sweep workers are the primary cleanup mechanisms, but lifecycle policy limits cost if the API or database is unavailable.

Use an equivalent provider-console policy or apply this AWS-compatible configuration separately to the primary and reserve buckets. Keep the expiration filters exact: a broader `community/` expiration would endanger published `community/final/` objects.

```json
{
  "Rules": [
    {
      "ID": "abort-community-multipart",
      "Status": "Enabled",
      "Filter": { "Prefix": "community/" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    },
    {
      "ID": "expire-community-pending",
      "Status": "Enabled",
      "Filter": { "Prefix": "community/pending/" },
      "Expiration": { "Days": 1 }
    },
    {
      "ID": "expire-community-candidates",
      "Status": "Enabled",
      "Filter": { "Prefix": "community/candidates/" },
      "Expiration": { "Days": 7 }
    }
  ]
}
```

```bash
aws --endpoint-url "$S3_ENDPOINT" s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" --lifecycle-configuration file://community-lifecycle.json
aws --endpoint-url "$S3_ENDPOINT" s3api get-bucket-lifecycle-configuration --bucket "$S3_BUCKET"
```

The deploy worker reads back and validates all configured buckets before migration. It requires versioning to be enabled and exactly one enabled, unconditional rule for each documented prefix and exact delay: pending expiration at one day, candidate expiration at seven days, and multipart abort at one day. With the actual production credentials it also creates two disposable versions and a delete marker, lists them, deletes every `VersionId`, and confirms an empty listing on primary and reserve. Missing, disabled, duplicate, additional, date-based, tagged, object-size-conditional, wrong-delay, broader overlapping rules, or insufficient all-version deletion permissions block the release. The admin API runs this same full gate before an initial setup or credential rotation.

Endpoint, region, bucket, and primary/reserve topology form an immutable physical storage generation. After initial setup the live admin API accepts only credentials, public-base URL, and signed-URL TTL changes for the same generation; a physical change fails with `s3_physical_generation_change_requires_offline_migration`. There is intentionally no live override. A physical move requires a dedicated deployment migration that quiesces API and worker writers, takes the verified post-quiesce backup, passes the full target verifier, copies every live object, permanently drains every old `community/` version and delete marker, proves the old targets empty, and only then atomically changes the stored configuration. Until such a migration is reviewed and shipped, changing or adding a bucket is unsupported.

After successful completion, an upload has a 15-minute attachment grace period. If no message transaction consumes the manifest in that window, the expiry worker claims it (waiting for stale leases when a processor or scanner was interrupted), atomically moves any media candidate ledger rows to cleanup, deletes staging, quarantine, candidate, and uncommitted final keys from both primary and reserve storage idempotently, and retains the manifest as `aborted` with the `expired_unattached` audit code. Attached manifests are excluded from this cleanup. A publishing-row sweep resumes a still-owned publish, removes both candidate and uncommitted final copies after abort, and removes only the candidate source when the final key is already committed as the ready winner.

ClamAV requires a host with enough memory for signature reloads. Production Compose reserves 3 GiB and defaults the hard limit to 4 GiB (`CLAMAV_MEMORY_LIMIT`). Do not lower it without a measured startup, signature-update/reload, EICAR, 50 MiB stream, sustained-queue and memory-pressure qualification. ClamAV health is intentionally separate from API readiness: an unavailable scanner leaves documents quarantined and retryable instead of making the application unavailable or publishing unchecked files.

Before release, verify the sidecar becomes healthy, its signature volume survives restart, EICAR is rejected and deleted from every configured bucket, a clean 50 MiB document reaches `ready`, and the pending/failed/cleanup-pending queue returns to zero. For the immutable promotion integration test, point `COMMUNITY_UPLOAD_S3_INTEGRATION_*` variables at a disposable S3-compatible test bucket. Production deployment also runs the read-only `community-cleanup-dry-run`; review its counts without deleting objects.
