# Admin and Learning Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize admin actions, move mailing history to its own routed screen, collapse project logs, preview lesson content and voice recordings, and apply measured API/database optimizations.

**Architecture:** Preserve the current Vue panels and API contracts. Add one routed task state for mailing history, small local UI state for audit disclosure, and a focused lesson-media preview helper that owns temporary object URLs. Database changes are limited to query patterns confirmed in the existing admin routes.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Vitest, Playwright, Bun/Hono, Drizzle/PostgreSQL, Docker Compose.

## Global Constraints

- Preserve existing permissions, save flows, payment freshness, mailing analytics, and learning data contracts.
- Support 320, 390, 768, 1024, and 1440 px without horizontal overflow.
- Keep controls at least 44 px high and provide accessible names and expanded state.
- Write and run a failing test before every production behavior change.
- Deploy only after full local verification.

---

### Task 1: Stable Admin Actions and Collapsible Audit

**Files:**
- Modify: `apps/web/src/features/admin/AdminPaymentsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminProjectSettingsPanel.vue`
- Test: `apps/web/src/features/admin/adminOperationalPanels.test.ts`

**Interfaces:**
- Consumes: existing `load()` functions and `audit: Ref<AdminActionLog[]>`.
- Produces: stable `.ops-head` layout and `auditExpanded: Ref<boolean>` controlled by an accessible button.

- [ ] Add failing source assertions for non-wrapping payment action and collapsed audit disclosure.
- [ ] Run the focused test and confirm the new assertions fail.
- [ ] Add the flexible heading/action CSS and audit disclosure state/template.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit the isolated admin-panel change.

### Task 2: Routed Mailing History

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminPanels.ts`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/admin/adminMailings.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `mailings`, `loadMailings()`, `openMailingDetail()` and the existing `TaskScreen` route helpers.
- Produces: `/admin/mailings/history`, `showMailingHistory`, and a full-width mailing list without a refresh button.

- [ ] Add failing tests for route mapping, history entry, removed refresh action, and direct URL opening.
- [ ] Run focused tests and confirm the assertions fail for the missing route/screen.
- [ ] Add route synchronization and replace the embedded list with a history navigation card.
- [ ] Render the existing list in a portal `TaskScreen` for `/admin/mailings/history` and keep detail navigation unchanged.
- [ ] Add responsive styles and run focused unit/E2E tests.
- [ ] Commit the mailing-history change.

### Task 3: Lesson Content and Audio Preview

**Files:**
- Create: `apps/web/src/features/learning/lessonEditorPreview.ts`
- Create: `apps/web/src/features/learning/lessonEditorPreview.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/learning/learningArchive.test.ts`

**Interfaces:**
- Produces: `resolveLessonEditorPreview({ kind, existingUrl, externalUrl, fileUrl }): string | null`.
- Consumes: existing lesson kind/source/file state and recorded `NamedBlobUpload` values.

- [ ] Add failing helper tests for existing, external, and local preview URL precedence.
- [ ] Run the helper test and confirm the module is missing.
- [ ] Implement the pure preview resolver.
- [ ] Add failing component assertions for visible existing content and playable recorded audio.
- [ ] Add object URL lifecycle state, preview template, and responsive media styles.
- [ ] Run focused learning tests and commit the preview change.

### Task 4: Measured API and Database Optimization

**Files:**
- Inspect/modify: `apps/api/src/db/schema.ts`
- Inspect/modify: relevant route/query modules under `apps/api/src/routes` and `apps/api/src/admin`
- Add migration under: `apps/api/drizzle`
- Test: focused query/schema tests under `apps/api/src`

**Interfaces:**
- Consumes: current route filters/order clauses and production-safe PostgreSQL indexes.
- Produces: migration-backed indexes or bounded query reductions without changing response schemas.

- [ ] Identify repeated filters/order clauses in admin clients, mailings, payments, and learning engagement.
- [ ] Add a failing schema/migration test for each justified missing index.
- [ ] Add the minimal migration and query projection changes.
- [ ] Run API tests and type checks; do not add stale response caching.
- [ ] Commit the measured server optimization separately.

### Task 5: Release and Production Verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Produces: the next application version and production deployment commit.

- [ ] Add the failing release-version assertion, update version/release notes, and pass the focused test.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm audit --prod`.
- [ ] Run routed Playwright audits for compact Android, 390 px, tablet, and iOS WebKit.
- [ ] Push `main`, deploy with `/opt/club-crm/deploy/update.sh`, and verify health/readiness/version.
- [ ] Confirm containers are healthy and `club-pwa-backup.timer` remains enabled and active.
