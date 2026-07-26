# Compact Full-Width UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the notification bell and make outer page/route/overlay gutters consistently minimal across the PWA.

**Architecture:** Co-locate eagerly required launcher CSS with the launcher component. Introduce one semantic edge-gutter contract in the UI foundation and bridge legacy task/overlay geometry to it while retaining internal component spacing.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright, pnpm

## Global Constraints

- Outer gutter: 8px normally and 4px through 360px.
- Preserve 44px minimum touch targets and safe-area clearance.
- Preserve route CSS splitting.
- Do not perform a real payment.
- Do not change application business logic.

---

### Task 1: Lock the regression contracts

**Files:**
- Modify: `apps/web/src/features/ui/foundation.test.ts`
- Modify: `apps/web/src/features/app/responsiveLayoutAudit.test.ts`
- Modify: `apps/web/src/features/app/notifications.test.ts`

**Interfaces:**
- Consumes: existing CSS source contracts.
- Produces: executable assertions for compact gutters and launcher-owned CSS.

- [ ] **Step 1: Write failing assertions** for 8px/4px gutters, full-width content, unscaled wide-layout gutters, shared task-screen geometry, and `notificationLauncher.css` imported by `NotificationCenter.vue`.
- [ ] **Step 2: Run targeted Vitest files** with `pnpm --filter @club/web test -- foundation.test.ts responsiveLayoutAudit.test.ts notifications.test.ts` and confirm the new assertions fail for the old values/import ownership.
- [ ] **Step 3: Commit the red test contract** with `git commit -m "test: define compact full-width UI contract"`.

### Task 2: Repair the notification launcher

**Files:**
- Create: `apps/web/src/features/app/notificationLauncher.css`
- Modify: `apps/web/src/features/app/NotificationCenter.vue`
- Modify: `apps/web/src/features/app/notificationRoute.css`

**Interfaces:**
- Consumes: foundation icon-button tokens.
- Produces: always-available `.notification-center-button` and `.notification-center-badge` visuals.

- [ ] **Step 1: Move launcher-only selectors** (container, button, compact state, hover/focus, badge) from route CSS into `notificationLauncher.css`.
- [ ] **Step 2: Import launcher CSS** from `NotificationCenter.vue` without importing route-only styles.
- [ ] **Step 3: Run notification and CSS ownership tests** and confirm the launcher contract passes.
- [ ] **Step 4: Commit** with `git commit -m "fix: load notification bell styles with launcher"`.

### Task 3: Apply the compact edge system

**Files:**
- Modify: `apps/web/src/features/ui/foundation.css`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/headerConsistency.test.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.layout.test.ts`

**Interfaces:**
- Consumes: safe-area tokens and existing page primitives.
- Produces: `--page-edge-gutter`, `--page-edge-gutter-compact`, and consistent full-width route/overlay geometry.

- [ ] **Step 1: Define foundation edge tokens** and map page padding to 8px/4px without wide-layout multiplication.
- [ ] **Step 2: Remove the desktop 24px page-container override** and set the page maximum width to 100%.
- [ ] **Step 3: Replace routed task-screen 14px side insets** with safe-area-aware shared page padding.
- [ ] **Step 4: Add authoritative overlay backdrop gutters** for application modal, dialog, confirmation, notification, support, payment, profile, and push-permission layers.
- [ ] **Step 5: Update geometry assertions** in header/profile tests to the shared token contract.
- [ ] **Step 6: Run targeted tests** and confirm all compact geometry contracts pass.
- [ ] **Step 7: Commit** with `git commit -m "fix: minimize application edge gutters"`.

### Task 4: Verify behavior and visual coverage

**Files:**
- Modify only if a verified defect is found.

**Interfaces:**
- Consumes: completed launcher and layout contracts.
- Produces: verified responsive release candidate.

- [ ] **Step 1: Run web unit tests** with `pnpm --filter @club/web test`.
- [ ] **Step 2: Run route CSS ownership and production build** using the repository scripts from `package.json`.
- [ ] **Step 3: Run browser audits** at 320, 390, 768, 1024, and 1440px over all primary tabs, representative task routes, and representative overlays; confirm edge gaps, overflow, safe areas, and bell badge geometry.
- [ ] **Step 4: Exercise the billing flow only up to provider confirmation** and do not submit a real payment.
- [ ] **Step 5: Run the full repository test suite** with `pnpm test`.
- [ ] **Step 6: Review the diff and commit any test-only audit additions** with `git commit -m "test: cover compact responsive application shell"`.

### Task 5: Release and deploy

**Files:**
- Modify: release/version files selected by the repository release script.

**Interfaces:**
- Consumes: fully verified release candidate.
- Produces: deployed production version and health-check evidence.

- [ ] **Step 1: Follow the repository release workflow** to bump the next patch version and service-worker cache version.
- [ ] **Step 2: Re-run required release checks** after the version change.
- [ ] **Step 3: Integrate the isolated branch without discarding unrelated user work.**
- [ ] **Step 4: Deploy using the existing project deployment workflow.**
- [ ] **Step 5: Verify production health, version, service worker, profile bell, and compact gutters.**
