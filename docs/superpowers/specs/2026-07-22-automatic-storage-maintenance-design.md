# Automatic Storage Maintenance Design

## Goal

Prevent the production server disk from filling silently while preserving application data, rollback safety, and useful recent build cache.

## Maintenance policy

- Run storage maintenance daily at 04:20 server time and shortly after boot if a run was missed.
- Cap Docker BuildKit cache at 2 GB with least-recently-used pruning.
- Remove only dangling Docker images older than 7 days.
- Cap persistent system journals at 150 MB and clear package-manager download caches.
- Never run broad `docker system prune`, container pruning, volume pruning, database deletion, upload deletion, or S3 deletion.
- Serialize runs with `flock`, write status atomically, and send an existing operational alert if the maintenance unit fails.
- Lower the early disk warning threshold from 75% to 70%; retain critical thresholds at 85% and 92%.

## Status reporting

The maintenance script writes an allowlisted, non-secret status file under `/var/lib/club-pwa-maintenance`. The API mounts only that directory read-only and reports the latest run, reclaimed bytes, disk usage before and after, Docker image/build-cache sizes, log size, and application-directory size.

The admin `Сервер` screen shows a dedicated storage card with a progress bar, free space, state label, last maintenance result, reclaimed space, and the main storage categories. It does not expose paths, credentials, or Docker control access.

## Failure handling

- A failed cleanup keeps the previous data intact and records `STATUS=failure` plus a bounded public error label.
- The systemd unit uses the existing owner-only operational email alert.
- Missing status data is displayed as `Ещё не запускалось`; it does not break the server page.

## Verification

- Static infrastructure tests lock down the safe command allowlist and forbidden destructive commands.
- Parser tests reject malformed or unbounded status values.
- Shared schema and admin UI tests cover the new response and mobile presentation.
- Production verification includes a manual maintenance run, exact deployed commit, disk usage, systemd state, API health/readiness, and confirmation that no application volume was removed.
