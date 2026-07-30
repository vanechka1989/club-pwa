# Admin Cancelled Autopay And Message Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly display cancelled recurrent billing in the admin client card and repair the mobile attachment control.

**Architecture:** Extend the shared admin user contract, enrich admin users with a batched latest-recurrent-status lookup, and derive the badge copy/tone in a small web helper. Keep the message business flow unchanged and fix only the editor layout.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Vue 3, CSS, Vitest, Playwright.

## Global Constraints

- Access remains active through its existing expiration date even when automatic billing is cancelled.
- The client list must not add one recurrent-subscription query per user.
- The attachment target must be at least 44 × 44 px and must not overlap entered text.

---

### Task 1: Recurrent status contract and API

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/admin/adminRecurrentStatus.test.ts`

**Interfaces:**
- Produces: `AdminStatsUser.recurrentPaymentStatus` and `getLatestRecurrentPaymentStatuses(userIds)`.

- [ ] Write a source-contract test that requires the shared field, batch query, latest-row selection, and serialized status.
- [ ] Run the focused test and verify it fails because the field and batch enrichment are absent.
- [ ] Add the shared field and one `inArray` query ordered by latest update; use the resulting map in the stats list and single-user fallback.
- [ ] Run the focused API/shared tests and verify they pass.

### Task 2: Status badge behavior

**Files:**
- Modify: `apps/web/src/features/admin/adminClientCard.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`
- Test: `apps/web/src/features/admin/adminClientCard.test.ts`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`

**Interfaces:**
- Produces: `getAdminRecurrentPaymentBadge(user)` returning the exact label and tone.

- [ ] Add failing tests for active, cancelled, and non-recurrent clients.
- [ ] Verify the tests fail on the current tariff-only badge.
- [ ] Render the derived badge and add the warning tone without changing access-date rendering.
- [ ] Run the focused web tests and verify they pass.

### Task 3: Mobile attachment geometry

**Files:**
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminClientCard.test.ts`

**Interfaces:**
- Consumes the existing `.admin-client-message-row` and `.admin-client-file-button` elements.

- [ ] Add a failing CSS contract test for a positioned editor, 44 px attachment button, and textarea left padding.
- [ ] Verify it fails against the current two-column layout.
- [ ] Change the editor to a one-column positioned wrapper and overlay the fixed attachment control inside the textarea boundary.
- [ ] Run the focused test and verify it passes.

### Task 4: Release and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: related release and PWA tests.

**Interfaces:**
- Produces the next app release and service-worker cache version.

- [ ] Update release metadata and matching tests.
- [ ] Run type checks, all tests, production build, and release E2E.
- [ ] Commit, push `main`, wait for every workflow, and verify `/api/health`, `/api/ready`, release assets, and the deployed commit.
