# Module Editor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both module creation and module editing use the routed page body and footer without a nested legacy modal action card.

**Architecture:** `LearningSection.vue` keeps the shared `TaskScreen`, moves module actions into its existing footer slot, and leaves only the form section in the scrollable body. Focused CSS classes control the create/edit footer layout while existing handlers and business logic remain unchanged.

**Tech Stack:** Vue 3 SFC, TypeScript, CSS, Vitest, Vue Test Utils.

## Global Constraints

- Preserve all module save, delete, confirmation, and disabled-state behavior.
- Apply the same structure to both create and edit states.
- Keep 14 px safe-area gutters, 44 × 44 px minimum tap targets, and no horizontal overflow from 320 px upward.

---

### Task 1: Lock the module editor page contract

**Files:**
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`
- Modify: `apps/web/src/features/learning/learningTaskScreens.test.ts`

**Interfaces:**
- Consumes: the existing `TaskScreen` footer slot and module handlers in `LearningSection.vue`.
- Produces: regression expectations for `.module-editor-content` and `.module-editor-footer`.

- [ ] **Step 1: Write failing tests** asserting that create and edit actions render under `.task-screen-footer`, the module body has no `.admin-form-actions`, and delete remains edit-only.
- [ ] **Step 2: Run tests to verify RED** with `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts src/features/learning/learningTaskScreens.test.ts`; expect missing footer structure assertions to fail.
- [ ] **Step 3: Commit the test contract** together with the minimal implementation from Task 2 after GREEN.

### Task 2: Move module actions into TaskScreen footer

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `editingModule`, `isSaving`, `deleteModule`, `closeModuleModal`, and `saveModule`.
- Produces: `.module-editor-content`, `.module-editor-footer`, `.module-editor-secondary-actions`, and `.module-editor-save`.

- [ ] **Step 1: Implement minimal Vue structure** by removing modal dialog semantics, keeping fields in `.module-editor-content`, and placing the existing buttons in `<template #footer>`.
- [ ] **Step 2: Add focused responsive CSS** so secondary actions form a stable row and save uses the full available width, while the task body contains no nested action panel.
- [ ] **Step 3: Run focused tests to verify GREEN** with the Task 1 command; expect all learning layout tests to pass.
- [ ] **Step 4: Commit** with `git commit -m "fix: restore module editor page layout"`.

### Task 3: Release and verify

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: version 5.30 and service-worker cache `club-pwa-v220`.

- [ ] **Step 1: Write release test changes first** for version 5.30, the module editor fix note, and cache v220; run the two tests and verify RED.
- [ ] **Step 2: Update version, bilingual current release note, and service-worker cache** without changing older notes.
- [ ] **Step 3: Run focused release tests and expect GREEN**.
- [ ] **Step 4: Build and visually audit** the create/edit structure at 320, 390, 768, 1024, and 1440 px, checking scrollbars, safe gutters, overflow, and 44 px controls.
- [ ] **Step 5: Run `pnpm test`, `pnpm build`, and `git diff --check`** and require zero failures.
- [ ] **Step 6: Commit** with `git commit -m "chore: release module editor layout as 5.30"`.
