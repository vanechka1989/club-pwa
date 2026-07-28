# Community upload operations

Community upload objects use three private S3 prefixes. `community/pending/` is writable only through short-lived upload capabilities and is never served. The API conditionally copies the verified ETag to `community/quarantine/` or `community/final/`, then removes staging. Documents remain URL-less in quarantine until ClamAV reports clean; infected or cleanup-pending files never receive a read URL.

Configure an S3 lifecycle rule on both storage buckets with `AbortIncompleteMultipartUpload` after one day. Also expire unreferenced `community/pending/` objects after one day as defense in depth. The API abort endpoint and expiry worker are the primary cleanup mechanisms, but lifecycle policy limits cost if the API is unavailable.

ClamAV requires a host with enough memory for signature reloads. Production Compose reserves 3 GiB and defaults the hard limit to 4 GiB (`CLAMAV_MEMORY_LIMIT`). Do not lower it without a measured startup, signature-update/reload, EICAR, 50 MiB stream, sustained-queue and memory-pressure qualification. ClamAV health is intentionally separate from API readiness: an unavailable scanner leaves documents quarantined and retryable instead of making the application unavailable or publishing unchecked files.

Before release, verify the sidecar becomes healthy, its signature volume survives restart, EICAR is rejected and deleted from every configured bucket, a clean 50 MiB document reaches `ready`, and the pending/failed/cleanup-pending queue returns to zero. For the immutable promotion integration test, point `COMMUNITY_UPLOAD_S3_INTEGRATION_*` variables at a disposable S3-compatible test bucket.
