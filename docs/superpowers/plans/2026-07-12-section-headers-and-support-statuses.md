# Section Headers and Support Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the Modules header, align all section gutters, and apply clear semantic support status colors.

**Architecture:** Reuse the existing shared `section-head ui-page-header` contract. Restructure only the Learning template boundary and add final scoped layout/status rules for Support so legacy selectors cannot override them.

**Tech Stack:** Vue 3, TypeScript, CSS variables, Vitest, Vite.

## Global Constraints

- Do not change APIs, routes, data, or ticket status logic.
- Header padding is 16 px and all section content follows the same page gutter.
- Closed is danger red, answered is accent blue, waiting/open is warning orange.
- Use semantic theme variables for all four themes.

---

### Task 1: Separate the Modules header

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Add a failing source test requiring `section-head ui-page-header` and a separate `modules-content` wrapper.
- [ ] Run `pnpm --filter @club/web test -- learningArchive.test.ts` and confirm the structural assertion fails.
- [ ] Change the outer Learning structure to `modules-section`, shared header, and separate module content without changing handlers.
- [ ] Run the focused test and confirm it passes.

### Task 2: Align support gutters and statuses

**Files:**
- Modify: `apps/web/src/features/support/supportSection.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Add failing CSS contract tests for zero board padding and danger/accent/warning status mappings.
- [ ] Run `pnpm --filter @club/web test -- supportSection.test.ts` and confirm failure.
- [ ] Add final scoped Support rules using `--danger`, `--accent`, and `--warning`; remove the extra mobile board gutter.
- [ ] Run the focused test and confirm it passes.

### Task 3: Release and verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] Set app version to 3.59 and cache to `club-pwa-v60` with release notes.
- [ ] Run `pnpm --filter @club/web test`, `pnpm --filter @club/web build`, and `git diff --check`.
- [ ] Commit, push main, rebuild only the web service, and verify production health, version 3.59, and cache v60.
