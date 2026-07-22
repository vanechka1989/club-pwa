# Admin Bundle Optimization Design

## Goal

Reduce the amount of JavaScript and CSS downloaded when the PWA opens and when an administrator first enters the admin area, without changing routes, permissions, data contracts, or visible behavior.

## Baseline

- Base JavaScript bundle: about 408 KB raw.
- Admin JavaScript bundle: about 431 KB raw.
- Global stylesheet: about 568 KB raw.
- `AdminSection.vue`: about 218 KB of source.
- Release history data: about 261 KB of source and currently part of the admin dependency graph.

## Architecture

The admin shell remains the owner of navigation and shared state. Already isolated admin screens become asynchronous Vue components so Vite emits independent chunks and loads them only when their routes or panels are visible. The release-history screen becomes a dedicated asynchronous component that owns release-note expansion and localization; the admin shell keeps only the version badge and route transition.

Styles that belong exclusively to the admin shell move from the eagerly loaded global stylesheet into an admin-owned stylesheet imported by the async admin root. Shared tokens, route geometry, theme foundations, and cross-feature rules remain global. Only clearly admin-scoped contiguous blocks are moved, avoiding selector rewriting and visual changes.

## Loading and error behavior

Async components use Vue's existing application-level loading behavior and preserve the current task-screen routes. A failed network chunk can be recovered with the existing reload flow. No authenticated API response is cached by the service worker.

## Constraints

- Preserve every admin route, permission check, API call, and visible string.
- Preserve the current five themes and mobile layout from 320 px upward.
- Do not introduce a new state-management library or UI dependency.
- Long inline admin panels are not rewritten unless extraction produces a measurable bundle benefit without duplicating state.
- Release version and production assets must be verified after deployment.

## Verification

- Source tests require dynamic imports and prohibit an eager release-note dependency in the admin shell.
- Existing web tests and TypeScript checks remain green.
- Production build output is compared with the baseline bundle sizes.
- Responsive route audits cover Android 320 px and iOS WebKit admin routes.
- Production health, readiness, commit, version, and emitted chunks are checked after deployment.
