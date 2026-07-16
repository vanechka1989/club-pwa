# iOS Support Keyboard Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep both support forms compact and usable above the iPhone PWA keyboard without duplicated keyboard spacing.

**Architecture:** Separate raw keyboard occlusion from the stable system safe inset in the shared viewport synchronizer. Render the create-ticket action through the existing task-screen footer so the body alone scrolls.

**Tech Stack:** Vue 3, TypeScript, CSS custom properties, Vitest, Vite.

## Global Constraints

- Do not change support business logic or API contracts.
- Preserve iPhone safe-area handling when the keyboard is closed.
- Use one keyboard-sized measurement only: the visible viewport.
- Update the application version and service-worker cache after verification.

---

### Task 1: Reproduce the duplicated keyboard inset

**Files:**
- Modify: `apps/web/src/features/app/deviceLayout.test.ts`
- Modify: `apps/web/src/features/support/supportSection.test.ts`

- [ ] Add assertions that a keyboard-open layout does not publish the raw keyboard gap as the system inset.
- [ ] Add assertions that the create-ticket submit button is associated with a footer outside the scrollable form.
- [ ] Run the focused tests and verify they fail for the missing behavior.

### Task 2: Correct shared viewport variables

**Files:**
- Modify: `apps/web/src/App.vue`

- [ ] Compute keyboard state before setting `--club-system-bottom` and `--club-calibrated-bottom-offset`.
- [ ] Publish zero dynamic system inset while the visible viewport is keyboard-reduced, retaining the raw value in `--club-keyboard-bottom`.
- [ ] Run device-layout and keyboard-focus tests until green.

### Task 3: Make create-ticket actions keyboard-safe

**Files:**
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/styles.css`

- [ ] Give the create-ticket form a stable id.
- [ ] Move its submit action into the task-screen footer with a matching `form` attribute.
- [ ] Ensure keyboard-open support footers use compact fixed padding and the body remains the only scrollable row.
- [ ] Run support tests until green.

### Task 4: Release and verify

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify affected version/PWA tests.

- [ ] Increment the visible application version and service-worker cache.
- [ ] Run focused tests, all tests, type checks, and the production build.
- [ ] Commit, push `main`, deploy, and verify the public health endpoint, version, and service worker.

