# S3 load test for 100 concurrent lesson uploads

## Goal

Measure the real production path used by lesson uploads when many clients upload media at the same time, without creating lesson records or leaving test files in S3.

## Production path under test

The test uses the same authenticated admin endpoints as the Vue learning editor:

1. `POST /api/admin/learning/materials/uploads/multipart`
2. `PUT` to the API-proxied `uploadUrl` returned for every multipart part
3. `POST /api/admin/learning/materials/uploads/multipart/complete`

Every part currently passes through the API process before it is forwarded to S3. The API accepts parts up to 8 MiB, so API memory and readiness are safety-critical signals.

## Profiles

### Smoke

- 3 image uploads at 1 MiB each.
- 2 video uploads at 9 MiB each.
- Proves authentication, multipart completion, object verification, cleanup, and reporting before the main run.

### Production

- Image phase: 100 clients, each uploading a unique 2 MiB WebP-labelled object (200 MiB total).
- Image ramp targets: 5, 10, 25, 50, 75, 100 concurrent clients.
- Video phase: 25 clients, each uploading a unique 24 MiB MP4-labelled object in three 8 MiB parts (600 MiB total).
- The video phase starts only after the image phase is healthy and its objects are removed.
- No lesson cards are created in the database.

## Authentication model

The runner uses one temporary owner session and independent HTTP upload flows. This measures 100 simultaneous network clients and the shared API/S3 bottleneck, not 100 distinct authorization identities.

Payload bytes are deterministic synthetic data. The objects and multipart sessions are unique, while payload content is intentionally reused inside a phase to avoid allocating hundreds of MiB in the load-generator process. This is a storage transport test, not a codec-decoding test.

## Measurements

- init, part, complete, verification, and cleanup request counts and latency percentiles;
- uploaded bytes, throughput, completed and failed clients;
- HTTP status distribution and structured errors;
- API health/readiness, RSS memory, event-loop delay, request counters, and container restarts;
- S3 object presence and exact size after completion;
- leftover completed objects and unfinished multipart sessions after cleanup.

## Safety gates

Stop launching new work when any of these conditions is met:

- `/api/health` or `/api/ready` is not healthy;
- API RSS exceeds 1.5 GB;
- upload HTTP error rate exceeds 1%;
- a stage has any completion or verification failure;
- the user has not explicitly supplied `CONFIRM_PRODUCTION_LOAD=YES` for the production host.

Already-running requests are allowed to settle for a bounded time, then cleanup always runs.

## Verification and cleanup

- A completed object is verified through the owner-only signed-read endpoint. The runner requests byte `0-0` and validates the total object size from `Content-Range`, proving both readability and exact size without downloading the object again.
- Completed objects are deleted through `DELETE /api/admin/storage/s3/objects`.
- Incomplete uploads that have uploaded parts are completed and then deleted in `finally`; a zero-part incomplete session is reported explicitly for server-side cleanup because the public API intentionally exposes no multipart-abort endpoint.
- Test filenames contain a unique run ID, allowing an independent residue scan.
- Cleanup failures make the run fail even if upload thresholds pass.

## Thresholds

- 100% object completion and size verification.
- HTTP upload error rate at or below 1%; the preferred result is zero.
- No health/readiness failures, container restarts, or OOM events.
- API RSS below 1.5 GB.
- Report throughput and latency without imposing an arbitrary pass threshold on the operator's internet uplink.

## Artifacts

- Machine-readable JSON in `tests/load/results/`.
- Human report in `docs/load-reports/` with environment, methodology, exact results, bottlenecks, and capacity conclusion.
