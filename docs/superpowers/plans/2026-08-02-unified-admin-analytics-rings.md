# Unified Admin Analytics Rings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate revenue and new-client KPI strip with a symmetrical six-item circular analytics grid that also surfaces messages for the selected period.

**Architecture:** Keep the change within the existing `AdminSection` analytics overview and its colocated stylesheet. Extend the existing visual grid rather than adding a new chart dependency, while distinguishing decorative value rings from true proportional rings.

**Tech Stack:** Vue 3, TypeScript, CSS custom properties and conic gradients, Vitest, Playwright.

## Global Constraints

- Do not invent percentages for revenue or new clients.
- Preserve existing analytics data contracts and drill-down screens.
- Support widths 320, 390, 768, 1024, and 1440 px without horizontal overflow.
- Preserve semantic theme tokens, 44 px tap targets, focus-visible treatment, and reduced-motion support.

---

### Task 1: Specify the unified five-metric structure

**Files:**
- Modify: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: existing analytics overview markup and `openStatisticsDetail(detail)` behavior.
- Produces: regression coverage for five ring actions and revenue/client drill-downs.

- [ ] **Step 1: Write failing structural assertions**

Require six `admin-stat-visual-action` buttons, value-ring classes for revenue, new clients, and messages, and removal of `admin-stat-summary-kpis`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts`

Expected: FAIL because only three visual actions exist and the KPI strip remains.

- [ ] **Step 3: Extend the release E2E assertions**

Require five visible rings and clicks from revenue to Finance and new clients to Clients.

### Task 2: Implement the unified visual grid

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`

**Interfaces:**
- Consumes: `adminStatistics.payments.revenueRub`, `paidOrders`, `clients.newInPeriod`, and `openStatisticsDetail`.
- Produces: five accessible `.admin-stat-visual-action` buttons in one `.admin-stat-visual-grid`.

- [ ] **Step 1: Replace the KPI articles with circular buttons**

Add revenue, new-client, and message buttons before the existing proportional metrics. Use formatted values inside `.admin-stat-ring.admin-stat-ring-value` and real-value accessible labels.

- [ ] **Step 2: Balance the six-item mobile grid**

Use a three-column grid with two equal rows. Use consistent dividers and responsive sizing.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts`

Expected: PASS.

### Task 3: Verify, release, and deploy

**Files:**
- Modify: release metadata and service-worker cache files already used by the project.

**Interfaces:**
- Consumes: project release workflow and `/opt/club-pwa/deploy/update.sh` deployment contract.
- Produces: a versioned production release containing the unified analytics grid.

- [ ] **Step 1: Run focused E2E and inspect screenshots**

Run the analytics overview test at 320, 390, 768, 1024, and 1440 px and inspect light/dark screenshots.

- [ ] **Step 2: Update release metadata test-first**

Advance the app release and service-worker cache identifiers, first updating the release assertions and verifying they fail.

- [ ] **Step 3: Run full verification**

Run: `pnpm test; pnpm check; pnpm build; pnpm test:e2e:release`

Expected: all commands exit 0.

- [ ] **Step 4: Commit, push, deploy, and verify production**

Deploy only the exact checked commit to `/opt/club-pwa`, then verify GitHub Actions, public health/readiness, release assets, service-worker cache, server HEAD, deployed marker, and container health.
