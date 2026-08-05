# External Uptime DNS Fallback Design

## Context

The scheduled GitHub Actions monitor has produced repeated false outage alerts while the application remained healthy. In every observed failure, the GitHub-hosted runner timed out while resolving `club2.myn8nservertest.ru`; it never reached the web server. Google DNS and Cloudflare DNS continued to return the production address, and all public endpoints returned HTTP 200.

## Considered approaches

1. Require two failed scheduled runs before opening an incident. This reduces noise, but delays real outage detection and requires cross-run state.
2. Treat every DNS failure as success. This removes the current noise but can hide a genuine public DNS outage.
3. Cross-check a runner DNS failure with independent public resolvers, then verify the real HTTPS endpoints against the returned address. This distinguishes a runner-local DNS failure from an actual DNS or application outage without delaying confirmed alerts.

Approach 3 is selected.

## Design

The existing direct check remains the primary path. It checks the public page, health endpoint, and readiness endpoint through normal DNS.

If the initial request fails with curl status 6 (host not resolved) or 28 (resolution/connection timeout), the script queries Google DNS-over-HTTPS and Cloudflare DNS-over-HTTPS in order. Each returned value must be a valid IPv4 address. For every valid address, the script repeats all three HTTPS checks with curl `--resolve`, preserving the production hostname for TLS and HTTP routing.

If any independently resolved address passes all endpoint checks, the run succeeds and emits a warning explaining that the GitHub runner resolver failed but the service was verified. If neither public resolver returns a usable address, or every resolved address fails the endpoint checks, the run fails as it does today. Non-DNS HTTP and content failures continue to fail immediately.

The workflow's issue creation and recovery behavior remains unchanged. A successful fallback therefore closes the currently open false incident on the next run.

## Testing

A shell-level regression test supplies a fake `curl` executable and runs the real monitoring script. It covers:

- normal DNS and all endpoints healthy;
- runner DNS failure with successful public DNS and `--resolve` verification;
- runner DNS failure with both public resolvers unavailable;
- an ordinary endpoint failure that must not be masked by the DNS fallback.

The existing Vitest infrastructure test will also assert that the behavioral regression test is part of the repository and that the fallback markers remain in the production script.

## Scope

Only the external monitoring script and its tests change. Application code, deployment configuration, production containers, and the notification workflow remain untouched.
