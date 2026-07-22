# Uptime Kuma Monitoring Design

## Goal

Add a private Uptime Kuma dashboard for Club PWA that continuously checks the public application and both API health contracts, retains uptime history, and is usable from a phone or desktop browser.

## Architecture

Uptime Kuma runs as a dedicated rootless Docker container in the existing production Compose network. Its SQLite data lives in a named local Docker volume. The container has no Docker socket, host filesystem, database credentials, or published host port. Caddy is the only ingress and exposes the authenticated dashboard at `https://club2.myn8nservertest.ru:8443` because the current DNS zone has no monitoring subdomain.

The production stack pins the supported Uptime Kuma 2 rootless image to the verified multi-architecture digest for the current stable release. Runtime privileges are restricted with `no-new-privileges`, all Linux capabilities dropped, a read-only root filesystem, a temporary `/tmp`, bounded logs, CPU, memory, and process limits.

## Monitors

The initial dashboard contains three HTTPS monitors with 60-second checks:

1. `Club PWA` checks `https://club2.myn8nservertest.ru/` for an HTTP 200 response.
2. `API Health` checks `https://club2.myn8nservertest.ru/api/health` and verifies the public health endpoint.
3. `API Ready` checks `https://club2.myn8nservertest.ru/api/ready` and verifies the readiness path, including the database dependency.

TLS certificate expiry remains enabled on the HTTPS monitors. Docker-container monitoring is intentionally excluded because granting access to `/var/run/docker.sock` would give the Internet-facing monitoring service control over the Docker host.

## Access and Security

The Kuma setup creates one administrator account with a generated temporary password. There is no public status page in this release. Caddy terminates TLS on port 8443, proxies WebSocket traffic, and applies security headers. The dashboard remains protected by Kuma authentication; the temporary password is handed to the owner once and should be changed after first login.

## Deployment and Recovery

The existing deployment worker treats Compose changes as a full reconcile and starts `uptime-kuma` together with the application services. Production verification checks the new container, HTTPS dashboard, application health/readiness, exact server commit, and absence of Kuma startup errors. The named volume survives container recreation. Removing the Kuma service and its Caddy listener rolls back the feature without affecting Club PWA; the data volume is retained unless explicitly removed.

## Limitations

Because Kuma initially runs on the same VPS, it records partial application failures and response-time degradation but cannot notify during a complete VPS or network outage. A later external monitor on another host can cover that failure mode. CPU, RAM, disk, and detailed logs are outside Kuma's role and require a metrics stack such as Netdata or Prometheus/Grafana.

## Verification

- Source tests assert the pinned rootless image, no Docker socket, least-privilege runtime settings, persistent data volume, Caddy TLS listener, and deployment reconciliation.
- `docker compose config` validates the production manifest.
- Full workspace checks, tests, and builds pass before deployment.
- Production returns HTTP 200 for the authenticated dashboard entry point, health and readiness remain successful, and all containers are running.
