# Community upload operations

Community upload objects use private S3 prefixes. `community/pending/` is writable only through short-lived upload capabilities and is never served. The API conditionally copies the verified ETag to `community/quarantine/` or `community/final/`, then removes staging. Media normalization first writes a lease-unique object below `community/candidates/`; only the worker that durably fences the manifest may copy that object to `community/final/`. Candidate keys are recorded in PostgreSQL before upload, and a retryable sweep removes both primary and reserve copies after interruption or failed cleanup. Documents remain URL-less in quarantine until ClamAV reports clean; infected or cleanup-pending files never receive a read URL.

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

The deploy worker reads back and validates all configured buckets before migration. An unavailable lifecycle API, a disabled rule, a delay above the stated bound, or a broad pending/candidate expiration blocks the release.

After successful completion, an upload has a 15-minute attachment grace period. If no message transaction consumes the manifest in that window, the expiry worker claims it (waiting for stale leases when a processor or scanner was interrupted), atomically moves any media candidate ledger rows to cleanup, deletes staging, quarantine, candidate, and uncommitted final keys from both primary and reserve storage idempotently, and retains the manifest as `aborted` with the `expired_unattached` audit code. Attached manifests are excluded from this cleanup. A publishing-row sweep resumes a still-owned publish, removes both candidate and uncommitted final copies after abort, and removes only the candidate source when the final key is already committed as the ready winner.

ClamAV requires a host with enough memory for signature reloads. Production Compose reserves 3 GiB and defaults the hard limit to 4 GiB (`CLAMAV_MEMORY_LIMIT`). Do not lower it without a measured startup, signature-update/reload, EICAR, 50 MiB stream, sustained-queue and memory-pressure qualification. ClamAV health is intentionally separate from API readiness: an unavailable scanner leaves documents quarantined and retryable instead of making the application unavailable or publishing unchecked files.

Before release, verify the sidecar becomes healthy, its signature volume survives restart, EICAR is rejected and deleted from every configured bucket, a clean 50 MiB document reaches `ready`, and the pending/failed/cleanup-pending queue returns to zero. For the immutable promotion integration test, point `COMMUNITY_UPLOAD_S3_INTEGRATION_*` variables at a disposable S3-compatible test bucket. Production deployment also runs the read-only `community-cleanup-dry-run`; review its counts without deleting objects.
