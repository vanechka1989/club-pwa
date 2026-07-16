# iOS Support Keyboard Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop iPhone support forms from jumping away from the focused field when the keyboard opens.

**Architecture:** Keep the existing `visualViewport`-sized task-screen grid and remove only the conflicting global focus movement for support task screens. Add an iOS-specific 16px text-control floor to prevent browser focus zoom.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, pnpm.

## Global Constraints

- Do not change support business logic or API contracts.
- Preserve Android, desktop, attachments, and ticket closure behavior.
- Use test-first changes and publish the normal app/service-worker version bump.

---

### Task 1: Support focus regression

**Files:**
- Modify: `apps/web/src/features/app/keyboardFocus.test.ts`
- Modify: `apps/web/src/features/app/keyboardFocus.ts`

**Interfaces:**
- Consumes: `ensureFocusedTextFieldVisible(element, schedule)`.
- Produces: support-task fields are handled by the task layout and native browser scrolling.

- [x] Add a failing test placing a textarea inside `.support-task-screen .task-screen` and assert that neither `scrollIntoView` nor delayed correction callbacks run.
- [x] Run `pnpm --filter @club/web test -- keyboardFocus.test.ts` and confirm the new test fails.
- [x] Add a support-task early return before the global task-screen centering path.
- [x] Re-run the focused test and confirm it passes.

### Task 2: iOS focus zoom regression

**Files:**
- Modify: `apps/web/src/features/support/supportSection.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `.support-field` and `.support-reply-form` text controls.
- Produces: a 16px computed font size on iOS.

- [x] Add a failing CSS regression test for a `body.club-ios` support-control rule containing `font-size: 16px`.
- [x] Run `pnpm --filter @club/web test -- supportSection.test.ts` and confirm the new test fails.
- [x] Add the minimal iOS selector covering new-ticket inputs/selects/textareas and ticket reply textareas.
- [x] Re-run the focused test and confirm it passes.

### Task 3: Release and deployment verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: the next application and service-worker version with bilingual release notes.

- [x] Add the next version and RU/EN notes describing the iPhone support keyboard correction.
- [x] Run focused tests, all tests, type checks, and production build.
- [ ] Commit and push `main`, wait for deployment success, and verify production health/version assets.
