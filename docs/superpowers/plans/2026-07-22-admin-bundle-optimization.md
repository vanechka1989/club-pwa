# Admin Bundle Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split heavy admin-only code and styles into on-demand chunks while preserving the current admin behavior and mobile layout.

**Architecture:** Keep `AdminSection.vue` as the navigation and shared-state shell, dynamically import isolated panels, move release history into its own lazy task component, and relocate only unambiguously admin-owned CSS from the global bundle.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Playwright, pnpm.

## Global Constraints

- Preserve all routes, permissions, API contracts, strings, themes, and task-screen behavior.
- Support Android from 320 px and iOS Safari/WebKit.
- Do not cache authenticated API responses.
- Start every production behavior change with a failing test.
- Deploy only after full verification and version update.

---

### Task 1: Lazy admin component boundaries

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/app/asyncSections.test.ts`

**Interfaces:**
- Preserve all existing props and emitted events of the admin child components.
- Produce `defineAsyncComponent(() => import(...))` boundaries for isolated admin screens.

- [ ] Add assertions that heavy admin children are dynamically imported and no longer statically imported.
- [ ] Run the focused test and confirm it fails on the eager imports.
- [ ] Replace eager imports with `defineAsyncComponent` declarations.
- [ ] Run focused tests and TypeScript checks.
- [ ] Build and record the emitted admin child chunks.
- [ ] Commit the task.

### Task 2: Lazy release-history task

**Files:**
- Create: `apps/web/src/features/admin/AdminReleaseNotesTask.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- `AdminReleaseNotesTask` emits `back` and owns localized notes plus expanded-version state.
- `AdminSection.vue` retains `appVersion`, `appVersionUpdatedAt`, route opening, and route closing.

- [ ] Add a failing source test requiring a lazy release component and forbidding `getLocalizedReleaseNotes` in the admin shell.
- [ ] Run it and confirm it fails for the eager release dependency.
- [ ] Move the release task template and accordion state into the new component.
- [ ] Dynamically import the component from the admin shell.
- [ ] Run release, admin navigation, and TypeScript checks.
- [ ] Build and verify release notes emit in a separate chunk.
- [ ] Commit the task.

### Task 3: Admin-owned stylesheet split

**Files:**
- Create: `apps/web/src/features/admin/adminShell.css`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/asyncSections.test.ts`

**Interfaces:**
- `AdminSection.vue` imports `./adminShell.css`.
- Shared foundation and cross-feature selectors remain in `styles.css`.

- [ ] Add a failing test requiring the async admin stylesheet and checking that selected admin-only blocks are absent from global CSS.
- [ ] Run it and confirm the global stylesheet still contains the blocks.
- [ ] Move clearly admin-only contiguous blocks without changing declarations or selector order within each block.
- [ ] Run web tests, TypeScript checks, and responsive audits.
- [ ] Build and compare base CSS and admin CSS against the baseline.
- [ ] Commit the task.

### Task 4: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Publish the next sequential application version and matching localized release note.

- [ ] Add a failing release-version assertion.
- [ ] Update version, date, Russian note, and current English note.
- [ ] Run full checks, tests, and production build.
- [ ] Run Android 320 px and iOS WebKit responsive admin-route audits.
- [ ] Compare final bundle sizes with the recorded baseline.
- [ ] Commit, push, deploy, and verify health, readiness, commit, version, and lazy chunks in production.
