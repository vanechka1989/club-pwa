# Service Worker Update Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent transient Service Worker load failures from appearing as application startup errors and retry safely when connectivity returns.

**Architecture:** Extract PWA lifecycle handling from `main.ts` into a focused module with injected browser dependencies for deterministic tests. Registration and updates are caught locally and serialized; recovery is event-driven through `online` and `visibilitychange`.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, browser Service Worker API.

## Global Constraints

- Do not add dependencies or background polling.
- Preserve the current worker activation and page refresh behavior.
- Expected Service Worker load failures must not reach global `unhandledrejection` diagnostics.
- Update the visible app version and Service Worker cache version for the release.

---

### Task 1: Recoverable Service Worker lifecycle

**Files:**
- Create: `apps/web/src/features/app/serviceWorkerLifecycle.ts`
- Create: `apps/web/src/features/app/serviceWorkerLifecycle.test.ts`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- Produces: `startServiceWorkerLifecycle(options?: ServiceWorkerLifecycleOptions): void`
- Consumes: browser `navigator.serviceWorker`, `document`, and `window` events.

- [ ] Write failing tests proving rejected registration/update promises do not escape and the next `online` event retries an update.
- [ ] Run `pnpm --filter @club/web test -- serviceWorkerLifecycle.test.ts` and confirm the test fails because the module does not exist.
- [ ] Implement the lifecycle module with local catches and a single in-flight update promise.
- [ ] Replace the inline lifecycle block in `main.ts` with the module call.
- [ ] Run the focused test and existing PWA tests.

### Task 2: Release metadata and complete verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: application version `4.59` and cache name `club-pwa-v158`.

- [ ] Update release tests first to expect `4.59` and `v158`; confirm they fail.
- [ ] Add the `4.59` release entry and bump both version constants.
- [ ] Run `pnpm test`, `pnpm check`, and `pnpm build`.
- [ ] Commit, push, deploy with the repository deployment workflow, and verify production health, `/sw.js`, and the visible version.
