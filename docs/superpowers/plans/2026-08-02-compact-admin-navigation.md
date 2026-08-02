# Compact Admin Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the large preview switcher and eight-tile admin grid with a compact mode button, three quick section buttons, and two accessible bottom sheets.

**Architecture:** Keep permission and route ownership in `AdminSection.vue`, derive primary and secondary navigation from the existing `panels` computed value, and reuse `BottomSheet.vue`. Add only local shell styling and regression coverage.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright.

## Global Constraints

- Preserve all existing admin permissions, panel IDs, routing, and preview behavior.
- Keep minimum tap targets at 44 px and avoid horizontal overflow from 320 through 1440 px.
- Reuse `BottomSheet.vue`; do not add a second modal implementation.
- The selected preview mode and active section must remain visually and programmatically identifiable.

---

### Task 1: Navigation contract tests

**Files:**
- Modify: `apps/web/src/features/admin/adminPermissionsSection.test.ts`
- Modify: `apps/web/src/features/admin/adminStorageSection.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: current `panels`, `ui.previewMode`, and `selectAdminPanel` behavior.
- Produces: failing assertions for the compact triggers, sheets, and navigation flow.

- [ ] **Step 1: Replace inline-switcher assertions**

Assert that `admin-preview-mode-trigger` and `admin-preview-mode-sheet` exist and `admin-preview-switcher` does not.

- [ ] **Step 2: Add quick-navigation assertions**

Assert primary IDs `statistics`, `users`, `payments`, an `admin-more-trigger`, and permission-filtered `secondaryPanels`.

- [ ] **Step 3: Run focused Vitest and verify RED**

Run: `pnpm --filter @club/web test -- adminPermissionsSection.test.ts adminStorageSection.test.ts`

Expected: FAIL because the old switcher and full panel grid still exist.

### Task 2: Compact shell implementation

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminRoute.css`

**Interfaces:**
- Consumes: `panels`, `previewModeOptions`, `handlePreviewModeChange`, and `selectAdminPanel`.
- Produces: `primaryPanels`, `secondaryPanels`, compact triggers, and two `BottomSheet` instances.

- [ ] **Step 1: Add derived navigation and sheet state**

Create primary ID filtering, secondary filtering, current preview label, and two boolean refs.

- [ ] **Step 2: Replace the header switcher and panel grid**

Render the compact mode trigger, three permission-aware primary buttons, and the `Ещё` trigger.

- [ ] **Step 3: Add both bottom sheets**

Render four preview choices and every secondary permitted panel, closing after selection.

- [ ] **Step 4: Add responsive local styles**

Use equal-width quick buttons, compact header actions, active states, and two-column sheet option grids where space permits.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/web test -- adminPermissionsSection.test.ts adminStorageSection.test.ts`

Expected: PASS.

### Task 3: Visual verification and release

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: release metadata and service-worker cache files used by the project.

**Interfaces:**
- Consumes: the compact shell from Task 2.
- Produces: a verified and versioned production release.

- [ ] **Step 1: Run focused Playwright and inspect screenshots**

Verify mode and section sheets, active states, 320–1440 px layout, and dark theme.

- [ ] **Step 2: Update release metadata test-first**

Advance the release and cache identifiers after first making their assertions fail.

- [ ] **Step 3: Run full verification**

Run: `pnpm test; pnpm check; pnpm build; pnpm test:e2e:release`

Expected: every command exits 0 and release E2E reports no failures.

- [ ] **Step 4: Deploy and verify production**

Deploy only the exact checked commit and verify workflow success, public health/readiness, release assets, service-worker cache, server HEAD, deployed marker, and container health.

