# Full-screen Header Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify full-screen headers and content gutters with the main PWA menu.

**Architecture:** Keep `TaskScreen` and chat markup unchanged. Establish one late authoritative CSS contract, retain only screen-specific layout rules, and protect the contract with source-level regression tests plus browser viewport checks.

**Tech Stack:** Vue 3, CSS, Vitest, Vite browser preview

## Global Constraints

- Preserve all business logic and data contracts.
- Use safe-area-aware 14 px horizontal gutters and an 18 px header radius.
- Verify widths 320, 390, 768, 1024, and 1440 px.

---

### Task 1: Shared task-screen contract

**Files:**
- Modify: `apps/web/src/features/app/headerConsistency.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Add a failing test for shared header/body geometry and absence of profile-only geometry.
- [ ] Run the focused test and confirm it fails for missing global geometry.
- [ ] Promote the profile route geometry to global `TaskScreen` rules.
- [ ] Run the focused test and confirm it passes.

### Task 2: Chat and support alignment

**Files:**
- Modify: `apps/web/src/features/app/headerConsistency.test.ts`
- Modify: `apps/web/src/features/community/community.css`
- Modify: `apps/web/src/styles.css`

- [ ] Add failing assertions for chat header/content and support gutters.
- [ ] Confirm the focused test fails for the existing 0/8/16 px rules.
- [ ] Apply the shared geometry while preserving chat and keyboard behavior.
- [ ] Confirm the focused test passes.

### Task 3: Release and verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

- [ ] Add failing release expectations for version 5.29 and cache v219.
- [ ] Update release metadata and make the tests pass.
- [ ] Run the full test suite and production build.
- [ ] Audit all five required widths in the browser and deploy `main`.
