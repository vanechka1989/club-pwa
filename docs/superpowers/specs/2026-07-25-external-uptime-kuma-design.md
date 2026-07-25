# External Uptime Kuma Design

## Goal

Run Uptime Kuma independently from the Club PWA production VPS so monitoring and its dashboard remain available when the application host is unavailable.

## Architecture

`monitor.myn8nservertest.ru` resolves to the dedicated monitoring VPS. That VPS runs the pinned rootless Uptime Kuma image behind Caddy on ports 80 and 443. Kuma data is stored in a dedicated Docker volume and is restored from an online SQLite backup of the existing instance.

The Club PWA VPS no longer runs or exposes Uptime Kuma. Its lightweight host-capacity systemd probe remains installed and continues to report local disk, memory, restart, OOM, and application-container failures through the existing operational email path.

## Production deployment changes

- Remove the `uptime-kuma` service and `uptime-kuma-data` volume from `docker-compose.prod.yml`.
- Remove the port `8443` listener and the Kuma reverse proxy from the application Caddy configuration.
- Reconcile only `postgres`, `api`, `web`, and `caddy` during full deployments.
- Stop treating Kuma as a local application health dependency or diagnostic log source.
- Stop installing the old local Kuma backup timer because the data no longer lives on the application VPS.
- Keep the PostgreSQL backup and restore-verification timers unchanged.
- Keep the local host-capacity monitor, but limit its container checks to application services.

## Cutover and rollback

The new instance is started and verified before the old container is removed. Verification covers SQLite integrity, migrated user and monitor counts, healthy containers, a valid public TLS certificate, dashboard reachability, and fresh successful monitor heartbeats.

The migration backup is retained temporarily on both hosts. If verification fails, the old instance remains active. After successful verification and deployment of the application configuration, the old Kuma container and image are removed; its named volume is retained temporarily for rollback and can be removed only after an additional stability check.

## Security and operations

Only SSH, HTTP, and HTTPS are allowed through the monitoring VPS firewall. Kuma port 3001 is private to the Docker network. The deployment uses the existing pinned image digest, drops Linux capabilities, enables `no-new-privileges`, limits CPU, memory, process count, and log size, and stores TLS state in persistent Caddy volumes.
