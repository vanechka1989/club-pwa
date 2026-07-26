# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make module deletion recoverable, make learning content draft-first, enforce owner-only developer UI, and repair 320 px customer UI without executing a real payment.

**Architecture:** Extend the existing category data model with archive state and reuse the lesson archive lifecycle for transactional category archive/restore. Keep presentation changes inside the existing learning/admin shells, extracting only pure policy helpers that earn focused unit tests. Validate payment UI through mocked network contracts only.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, Vue 3/Pinia, Vitest, Playwright, pnpm, Docker/GitHub Actions.

## Global Constraints

- Do not initiate a real payment, open a live provider checkout, or create a production payment order during verification.
- Preserve production data during all post-deployment smoke checks.
- Keep API changes backward compatible with defaults for new response fields.
- Use test-first red/green cycles for each behavior change.
- Keep tap targets at least 44 x 44 px and verify 320, 390, 768, 1024, and 1440 px.

---

### Task 1: Category archive contract and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0057_content_category_archive.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: existing `learningCategorySchema` and `adminLearningResponseSchema`.
- Produces: `LearningCategory.archivedUntil: string | null` and `AdminLearningResponse.deletedCategories: LearningCategory[]`.

- [ ] **Step 1: Write failing schema tests** proving legacy responses default `archivedUntil` to `null` and `deletedCategories` to `[]`.
- [ ] **Step 2: Run `pnpm --filter @club/shared test -- index.test.ts`** and confirm the new expectations fail because the fields are missing.
- [ ] **Step 3: Add the nullable category column, index, migration journal entry, and backward-compatible shared schema fields.**
- [ ] **Step 4: Re-run the focused shared tests and `pnpm --filter @club/shared check`** and confirm they pass.
- [ ] **Step 5: Commit the category archive contract.**

### Task 2: Transactional module archive, restore, and cleanup

**Files:**
- Create: `apps/api/src/learning/categoryArchive.ts`
- Test: `apps/api/src/learning/categoryArchive.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/learning.ts`

**Interfaces:**
- Produces: pure archive-state builders for a seven-day TTL; `POST /admin/learning/categories/:id/restore`; active/deleted category separation in `GET /admin/learning`.
- Guarantees: archive and restore update the category and lessons in a transaction; archive performs no S3 deletion; restore leaves all restored records unpublished.

- [ ] **Step 1: Write failing unit tests** for the seven-day archive timestamp, draft-only restore state, and expired/active restore guards.
- [ ] **Step 2: Run the focused API test** and confirm failure because the archive policy module does not exist.
- [ ] **Step 3: Implement the pure archive policy and route/database integration**, including member-query exclusion and expired category cleanup after lesson object cleanup.
- [ ] **Step 4: Add request-level regression coverage using the existing admin route harness or the narrowest available integration boundary.**
- [ ] **Step 5: Run focused API tests and `pnpm --filter @club/api check`** and confirm green.
- [ ] **Step 6: Commit recoverable module deletion.**

### Task 3: Draft-first module and lesson editors

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Test: `apps/web/src/features/learning/learningArchive.test.ts`
- Test: `apps/web/src/features/learning/lessonEditorActions.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: category/material `isPublished` status and existing status endpoints.
- Produces: create/update payloads with explicit `isPublished`; editor controls labeled `Опубликовать модуль` and `Опубликовать урок`; visible `Черновик`/`Опубликовано` badges.

- [ ] **Step 1: Write failing component/E2E tests** proving new content defaults to draft, edits preserve status, and the archived module can be restored from deleted content.
- [ ] **Step 2: Run the focused tests** and confirm the expected controls and restore flow are absent.
- [ ] **Step 3: Implement category payload support, module/lesson publication state, badges, archived-module presentation, and restore client call.**
- [ ] **Step 4: Re-run focused component and Playwright tests** and confirm green.
- [ ] **Step 5: Commit draft publishing and module restore UI.**

### Task 4: Owner-only developer UI

**Files:**
- Create: `apps/web/src/features/admin/developerPreview.ts`
- Test: `apps/web/src/features/admin/developerPreview.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces: `canUseDeveloperPreview(realRole, previewMode): boolean` and `normalizeAdminPreviewMode(realRole, previewMode): PreviewMode`.

- [ ] **Step 1: Write failing policy and browser tests** proving an administrator with stale `club-preview-mode=developer` cannot open `/admin/releases` and is normalized to admin mode.
- [ ] **Step 2: Run the focused tests** and confirm the current localStorage-only guard fails them.
- [ ] **Step 3: Implement the pure role policy and wire it into route visibility and preview normalization.**
- [ ] **Step 4: Re-run policy/E2E tests** and confirm owner access still works while administrator access is denied.
- [ ] **Step 5: Commit the developer authorization fix.**

### Task 5: 320 px payment and navigation usability

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.ts`
- Modify: `tests/e2e/customerJourney.audit.spec.ts`

**Interfaces:**
- Produces: wrapping payment title and visible compact bottom-navigation labels at 320 px with no overflow.

- [ ] **Step 1: Add failing source-contract and browser assertions** for a non-ellipsized title, visible labels, 44 px targets, and zero horizontal overflow at 320 px.
- [ ] **Step 2: Run the focused web and 320 px Playwright tests** and confirm the current CSS fails.
- [ ] **Step 3: Add the minimal responsive overrides** while preserving existing safe-area and scaled-app rules.
- [ ] **Step 4: Re-run the focused tests and capture the 320 px screenshot** for visual inspection.
- [ ] **Step 5: Commit the narrow-screen UI fix.**

### Task 6: Full verification, reports, and deployment

**Files:**
- Modify: `docs/reports/2026-07-26-customer-journey-audit.md`
- Modify: `docs/reports/2026-07-26-admin-developer-modules-audit.md`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: one release commit on `main`, deployed by `.github/workflows/deploy.yml`, with production health/version evidence.

- [ ] **Step 1: Bump the service-worker cache version and run `pnpm check`, `pnpm test`, `pnpm build`, bundle budgets, and `pnpm test:e2e:release`.**
- [ ] **Step 2: Run responsive route/customer audits at the required viewport matrix without any live payment-provider request.**
- [ ] **Step 3: Update both reports with fixed findings, exact test counts, screenshots, residual external risks, and the explicit no-real-payment constraint.**
- [ ] **Step 4: Run final verification again after documentation/version changes and inspect `git diff --check` plus the complete diff.**
- [ ] **Step 5: Merge into `main`, push `origin/main`, monitor the deployment workflow, and only then run read-only production health, manifest, service-worker, and protected-route smoke checks.**

## Self-review

- Every audit recommendation that can be completed safely without external credentials maps to Tasks 1-5.
- The external email/provider transaction remains explicitly outside scope by user instruction.
- API field names and client payload names use `isPublished`, `archivedUntil`, and `deletedCategories` consistently.
- Broad component refactoring is intentionally excluded; it is not required for correctness and would increase deployment risk.
