# Compact Client And Finance Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make client and finance detail headers compact on phones and give every finance product a clearly distinguishable chart color.

**Architecture:** Keep the existing `TaskScreen` and finance data flow. Restructure only header slots and semantic CSS, preserving 44x44 tap targets while reducing visible control chrome; assign a fixed six-color categorical palette to donut segments and legends.

**Tech Stack:** Vue 3, TypeScript, scoped CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- Work on the explicitly authorized production branch and release as app version `6.24` with service worker `v296`.
- Do not change client permissions, deletion authorization, finance calculations, or demo generation logic.
- Verify 320px and 390px phone layouts, light and dark themes, no horizontal overflow, and minimum 44x44 interactive targets.

---

### Task 1: Compact client identity header

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`

**Interfaces:**
- Consumes: existing `selectedUser`, `userTitle`, `membershipStatus`, and access summary values.
- Produces: `.admin-client-task-title-line` containing the client name and access badge; `.admin-client-task-statuses` containing secondary badges only.

- [ ] **Step 1: Write the failing test**

Render a selected active client and assert that `Доступ открыт` is inside `.admin-client-task-title-line` and absent from `.admin-client-task-statuses`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- AdminClientsPanel.test.ts`
Expected: FAIL because `.admin-client-task-title-line` is not rendered.

- [ ] **Step 3: Write minimal implementation**

Add the title row, move the access badge beside the heading, and reduce avatar/header spacing without reducing interactive targets.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @club/web test -- AdminClientsPanel.test.ts`
Expected: PASS.

### Task 2: Compact finance detail header

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

**Interfaces:**
- Consumes: existing `statisticsDetailMeta`, `showcaseAnalyticsEnabled`, `showcaseRegenerationConfirmed`, and `regenerateShowcaseAnalytics`.
- Produces: compact heading with an inline `Демо` badge and a 44x44 icon regeneration control with an accessible name.

- [ ] **Step 1: Write the failing test**

Mount the statistics detail state and assert that the demo badge belongs to the heading while the action area contains one compact regeneration button.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts`
Expected: FAIL because the current header stacks two full-width 44px blocks.

- [ ] **Step 3: Write minimal implementation**

Use the `heading` slot for title, subtitle, and demo badge. Keep regeneration feedback and expose the icon button through `aria-label` and `title`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts`
Expected: PASS.

### Task 3: Distinct finance product palette and release verification

**Files:**
- Modify: `apps/web/src/features/admin/adminShell.css`
- Test: `apps/web/src/features/admin/AdminFinanceAnalytics.test.ts`
- Modify: release/version files identified by the repository version scripts.

**Interfaces:**
- Consumes: existing `is-segment-0` through `is-segment-5` classes.
- Produces: teal, blue, yellow, violet, orange, and pink categorical colors shared by chart segments and legend dots.

- [ ] **Step 1: Write the failing visual behavior test**

Render at least four products in a real browser and assert that their computed legend colors are unique and sufficiently separated in RGB space.

- [ ] **Step 2: Run test to verify it fails**

Run the focused finance Playwright test.
Expected: FAIL because current semantic theme colors include nearby teal/green hues.

- [ ] **Step 3: Write minimal implementation**

Replace semantic status colors for categorical data with six fixed, high-distance series tokens.

- [ ] **Step 4: Verify and release**

Run focused tests, repository checks, build, mobile browser screenshots at 320px and 390px in light and dark themes, release E2E, deployment preflight, GitHub deployment, and post-deployment endpoint/commit/notification checks.
