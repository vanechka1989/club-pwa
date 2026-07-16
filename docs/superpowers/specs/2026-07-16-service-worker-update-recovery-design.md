# Service Worker Update Recovery Design

## Problem

On iOS, a transient failure while loading `/sw.js` rejects `serviceWorker.register()` or `registration.update()`. The rejection currently has no handler, so the global boot diagnostics reporter records it as an application startup failure even when Vue and the API continue working.

## Approved behavior

- A Service Worker registration or update failure must never become an unhandled promise rejection.
- A failed update must leave the currently running application and previously installed worker intact.
- The application retries an update when it becomes visible again or the browser reports that the network is online.
- Only one update request may run at a time.
- Expected Service Worker load failures are not sent to the server-error feed.
- No background polling or new dependency is introduced.

## Implementation

Move Service Worker lifecycle orchestration into a small testable module. The module wraps registration and update calls, catches failures locally, deduplicates concurrent update attempts, and registers `visibilitychange` and `online` recovery hooks. `main.ts` starts the module after the window `load` event.

## Verification

Unit tests reproduce a rejected registration and rejected update, assert that no rejection escapes, and verify recovery on the next online/visible event. Existing PWA, type-check, build, and complete test suites must remain green. Production verification checks `/api/health`, `/sw.js`, and the deployed application version.
