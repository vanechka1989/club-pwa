# Lesson Cover Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three persistent lesson-cover modes and remove visible white corners from standard covers.

**Architecture:** Persist `coverMode` on learning content, expose it through shared schemas and both APIs, and resolve the final image in a small web helper. Keep uploaded thumbnails when switching modes and use a deterministic fallback to the themed default cover.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle/PostgreSQL, Zod, Vitest, CSS.

## Global Constraints

- Existing custom covers must remain custom after migration.
- First-material mode must never produce a broken image.
- Custom images must not receive the standard-cover crop.
- All new UI copy must have English translations.

---

### Task 1: Persist and expose cover mode

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0042_lesson_cover_mode.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Test: `packages/shared/src/learningContent.test.ts`
- Test: `apps/api/src/routes/adminLearning.test.ts`

- [ ] Write failing schema and route-source tests for `default`, `custom`, and `first_material`.
- [ ] Run the focused tests and confirm they fail because `coverMode` is absent.
- [ ] Add the database column, migration backfill, serializers, payload validation, create, and update persistence.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Resolve cover source and build the editor control

**Files:**
- Create: `apps/web/src/features/learning/lessonCover.ts`
- Create: `apps/web/src/features/learning/lessonCover.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`

- [ ] Write failing tests for source priority, fallback, editor controls, and payload values.
- [ ] Run focused web tests and confirm the feature is missing.
- [ ] Implement the resolver and connect the editor, lesson model, API payload, and card rendering.
- [ ] Run focused tests and confirm they pass.

### Task 3: Polish standard covers and localization

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/interfaceLocalization.ts`
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`

- [ ] Add a failing assertion for a standard-cover-only crop class and translated labels.
- [ ] Add compact segmented-control styling and hide white source-image corners without affecting custom covers.
- [ ] Run focused tests and typechecks.

### Task 4: Release and deploy

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: release and PWA tests.

- [ ] Add failing release-version expectations.
- [ ] Increment app and service-worker versions and add Russian/English release notes.
- [ ] Run the complete test suite and production build.
- [ ] Commit, push `main`, run the production database migration, rebuild without cache, and verify the public bundle and health endpoint.
