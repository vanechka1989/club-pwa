# Compact Admin Permission List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace oversized permission tiles and stretched switches with a compact mobile settings list, and remove success alerts for permission changes.

**Architecture:** Keep the existing Vue state, API calls, route, and permission contracts. Change only the permission task markup feedback path and final scoped CSS so global input styles cannot resize switches.

**Tech Stack:** Vue 3, TypeScript, CSS custom properties, Vitest, Vite.

## Global Constraints

- Preserve all admin permission API and authorization behavior.
- Permission rows have a minimum 44 px touch target.
- Switch visual size is exactly 44×24 px and cannot inherit text-input sizing.
- Successful permission toggles do not create green alerts; failures remain visible.
- Use existing semantic theme tokens across all four themes.

---

### Task 1: Compact permission rows and switches

**Files:**
- Modify: `apps/web/src/features/admin/adminPermissionsSection.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing `.admin-permission-surface`, `.admin-permission-grid`, `.admin-permission-toggle` and checkbox markup.
- Produces: compact list rows and fixed-size switches without changing component data.

- [ ] **Step 1: Write failing CSS contract tests**

Assert scoped switch declarations include `width: 44px`, `height: 24px`, `min-height: 24px`, `padding: 2px`, and permission rows do not use the old card gap.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- adminPermissionsSection.test.ts`

Expected: failure because current switches inherit the global input height and permission rows still render as large tiles.

- [ ] **Step 3: Implement the compact list**

Add final, component-scoped CSS that fixes the switch box model, thumb position, row padding, dividers, typography, and long-label wrapping. Keep the label as the full clickable target.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @club/web test -- adminPermissionsSection.test.ts`

Expected: all admin permission tests pass.

### Task 2: Quiet success feedback

**Files:**
- Modify: `apps/web/src/features/admin/adminPermissionsSection.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`

**Interfaces:**
- Consumes: `handleUpdateAdminAccess`, `toggleAdminPermission`, `setStatus`, existing error handling.
- Produces: permission toggles that save without success banners while preserving errors.

- [ ] **Step 1: Write a failing source behavior test**

Assert `handleUpdateAdminAccess` does not call `setStatus("Права админа сохранены.")` and still has its `catch` path.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- adminPermissionsSection.test.ts`

Expected: failure on the existing success status call.

- [ ] **Step 3: Remove only the success status call**

Keep server state replacement and failure feedback unchanged; remove the green success banner produced after a successful update.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @club/web test -- adminPermissionsSection.test.ts`

Expected: all tests pass.

### Task 3: Release and verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: app version 3.58 and PWA cache v59.

- [ ] **Step 1: Update release identifiers and notes**

Set version to `3.58`, cache to `club-pwa-v59`, and describe the compact permission rows and quiet success feedback.

- [ ] **Step 2: Run complete web verification**

Run: `pnpm --filter @club/web test && pnpm --filter @club/web build && git diff --check`

Expected: zero failed tests, successful production build, and no whitespace errors.

- [ ] **Step 3: Commit, push, deploy, and verify production**

Commit the implementation, push `main`, run `DEPLOY_FORCE=1 bash deploy/update.sh`, then verify `/api/health`, app version `3.58`, and service-worker cache `v59`.
