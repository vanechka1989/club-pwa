# Application Optimization Design

## Goal

Improve cold-start speed, mobile task-screen correctness, S3 request latency, deployment efficiency, and production recoverability without changing the application’s business behavior or visual language.

## Scope

The first production package contains five independently reversible changes:

1. Portal task screens isolate background content from focus and blur any background field when opened.
2. Large application sections load as route-level asynchronous chunks while the authentication shell remains eager.
3. S3 configuration and clients are reused in-process, with explicit invalidation after storage settings change.
4. The vulnerable transitive `shell-quote` version is overridden with a patched release.
5. Production containers receive bounded logs, a smaller multi-stage API image, and an off-site PostgreSQL backup command with retention and restore verification documentation.

Large database rewrites for admin statistics and acquisition analytics remain a second package: they need dedicated query-contract tests and production comparison of old and new aggregates. They are not mixed into this release so the performance changes remain measurable and rollback remains simple.

## Frontend architecture

`App.vue` will keep the authentication and global shell components eager. Profile, learning, community, payments, support, and admin sections will use `defineAsyncComponent` imports. Vite will create separate hashed chunks and the existing authenticated navigation contract remains unchanged.

Portal `TaskScreen` instances register in a small shared task-layer registry. While at least one portal task screen is open, the application shell is inert. Opening a task screen blurs a focused element outside that screen and moves focus to the screen’s back button. Closing the last task screen restores normal interaction. Nested portal screens are supported through a reference count.

## API architecture

S3 runtime state will cache the resolved storage configuration for at most 60 seconds and reuse one `S3Client` per effective target configuration. Updating storage settings explicitly invalidates the runtime cache, so administrator changes are visible immediately. A rejected configuration load is never retained.

## Operations architecture

The API Dockerfile will separate dependency installation from the runtime image and use ownership-aware copies instead of recursively changing `/app`. Compose services will use Docker JSON log rotation. A backup script will create a compressed PostgreSQL dump, upload it to a configured private S3 destination, prune old local artifacts, and fail non-zero on any incomplete step. Scheduling is installed only after a successful manual backup and restore validation.

## Error handling and rollback

- Async section load failures remain visible through the existing application error boundary and can be recovered by reload.
- Task-layer cleanup runs on unmount and cannot leave the shell inert after navigation.
- S3 cache invalidation is safe to call repeatedly; rejected config reads clear themselves.
- Backup failures do not delete the last successful artifact.
- Deployment keeps the existing health-checked rollback flow.

## Verification

- Unit tests cover task-layer depth/focus isolation and S3 cache reuse/invalidation/rejection.
- Existing web and API test suites remain green.
- Production builds prove route chunks are emitted separately.
- Mobile Playwright checks run at 320, 390, 768, 1024, and 1440 widths, including the client 360 keyboard scenario.
- Dependency audit reports no known high-severity production advisory from `shell-quote`.
- A production health/readiness check and a real backup/restore verification complete before the release is reported successful.
