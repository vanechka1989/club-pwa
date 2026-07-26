# Application Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the production entry payload and make application-load regressions fail CI without changing product behavior.

**Architecture:** Move shared transport and startup-only endpoints out of the monolithic API client so lazy product sections no longer pull every endpoint into the entry chunk. Load community styling with its async section, defer a rare global screen, and enforce gzip budgets against real Vite output.

**Tech Stack:** Vue 3, TypeScript, Vite 6, Vitest, Playwright, Node `zlib`.

## Global Constraints

- Preserve all API paths, request bodies, headers, credentials, and exported client function signatures.
- Preserve the existing four themes and responsive behavior from 320 through 1440 px.
- Entry JavaScript must be at most 105 000 gzip bytes.
- Entry CSS must be at most 78 000 gzip bytes.
- Combined entry JavaScript and CSS must be at most 180 000 gzip bytes.
- HTML/API/service-worker responses remain non-cacheable; hashed assets remain immutable.

---

### Task 1: Production bundle budget

**Files:**
- Create: `apps/web/scripts/bundleBudget.mjs`
- Create: `apps/web/scripts/bundleBudget.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `measureEntryAssets(distDirectory)` returning entry JS/CSS gzip totals and `assertBundleBudget(metrics, limits)` throwing a readable error.

- [ ] **Step 1: Write the failing test**

Create a temporary Vite-like `dist/index.html` with known JS/CSS files, assert hand-computed asset selection and assert that an over-budget metric throws.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter @club/web test -- scripts/bundleBudget.test.ts`

Expected: FAIL because `bundleBudget.mjs` does not exist.

- [ ] **Step 3: Implement the analyzer**

Parse module scripts and stylesheet links from `dist/index.html`, gzip each referenced file with `gzipSync`, and reject missing assets, empty entry groups, or exceeded limits. Add `bundle:check` and run it after `vite build`.

- [ ] **Step 4: Verify GREEN and baseline failure**

Run the focused test, then `pnpm --filter @club/web build`.

Expected: unit test PASS; build FAIL on the existing 123 277-byte JS and 80 299-byte CSS entries.

### Task 2: Startup API boundary

**Files:**
- Create: `apps/web/src/api/http.ts`
- Create: `apps/web/src/api/startup.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/stores/session.ts`
- Modify: `apps/web/src/stores/notifications.ts`
- Modify: API mocks in affected tests.

**Interfaces:**
- `http.ts` produces `api`, `apiUrl`, `getApiRequestHeaders`, and `previewModeStorageKey`.
- `startup.ts` produces the existing session, app-state, notification, push, acquisition, avatar, checkout and payment-history functions needed by the eager graph.
- `client.ts` preserves existing exports for lazy consumers.

- [ ] **Step 1: Add an entry-artifact regression assertion**

Extend the bundle analyzer to accept forbidden entry substrings and configure it to reject a lazy-only endpoint such as `/admin/server-status` in entry JavaScript.

- [ ] **Step 2: Verify RED**

Run a production build and confirm the budget/forbidden endpoint check fails against the existing entry.

- [ ] **Step 3: Extract transport and startup endpoints**

Move transport configuration without semantic changes, implement startup functions on the shared `api`, remove their duplicate definitions from `client.ts`, and re-export them there.

- [ ] **Step 4: Point eager consumers at startup.ts**

Update only `App.vue`, session store and notifications store plus their module mocks. Lazy sections keep the compatibility client.

- [ ] **Step 5: Verify focused tests and build**

Run session/auth/notifications/App tests, TypeScript check, and production build. Confirm the JS budget passes and the lazy-only endpoint is absent from entry JS.

### Task 3: Route-owned CSS and rare screens

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/features/community/communityArchive.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- `CommunitySection.vue` owns `community.css` through a static CSS import in its async chunk.
- `NotificationCenterScreen` remains prop/event-compatible but is created with `defineAsyncComponent`.

- [ ] **Step 1: Change the community archive test to require route ownership**

Assert that the eager `main.ts` no longer imports `community.css` and `CommunitySection.vue` does import it.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @club/web test -- communityArchive.test.ts`

Expected: FAIL because CSS is still eagerly imported.

- [ ] **Step 3: Move the CSS import and defer notification center**

Move the import without changing stylesheet contents, replace the eager notification screen import with `defineAsyncComponent`, and increment the Service Worker cache version.

- [ ] **Step 4: Verify GREEN and CSS budget**

Run focused tests and production build. Confirm entry CSS is below 78 000 gzip bytes and a separate community CSS asset is emitted.

### Task 4: Runtime, visual and release verification

**Files:**
- Create: `docs/load-reports/2026-07-26-application-load-performance.md`

**Interfaces:**
- Produces a reproducible before/after report with raw/gzip entry sizes and Lighthouse metrics.

- [ ] **Step 1: Run full static and unit verification**

Run `pnpm check`, `pnpm test`, and `pnpm build` with zero failures.

- [ ] **Step 2: Run release E2E**

Run `pnpm test:e2e:release`; expect 13 passes and the two intentional platform skips.

- [ ] **Step 3: Run browser performance and viewport audits**

Serve the production build, run Lighthouse on `/profile`, and run Playwright at 320x720, 390x844, 768x1024, 1024x768 and 1440x900. Reject console/page errors, horizontal overflow, missing manifest, or broken initial/auth shell.

- [ ] **Step 4: Write the before/after report**

Record baseline and final entry bytes, percentage reduction, Lighthouse FCP/LCP/score, test results, and any remaining bottleneck.

- [ ] **Step 5: Commit implementation**

Commit code, tests and report as `perf: reduce application startup payload`.

### Task 5: Merge and production deployment

**Files:**
- Modify only if deployment verification exposes a regression.

- [ ] **Step 1: Verify branch and merge to main**

Confirm a clean worktree, fast-forward or merge the feature into current `main`, and rerun the full verification on the merged commit.

- [ ] **Step 2: Push and monitor CI/CD**

Push `main`, monitor dependency scan, check, tests, build, release E2E and SSH deployment to completion.

- [ ] **Step 3: Verify production independently**

Confirm `/api/health` returns 200/`{"ok":true}`, root HTML returns 200, `sw.js` carries the new cache version, server HEAD and deployed marker match the pushed commit, and all compose services are running/healthy.

- [ ] **Step 4: Clean the owned worktree**

After successful deployment, remove only `.worktrees/application-load-performance`, prune worktree metadata and delete the merged feature branch.
