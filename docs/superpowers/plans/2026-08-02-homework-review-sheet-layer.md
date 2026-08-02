# Homework Review Sheet Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the homework review dialog and its decision buttons above the mobile bottom navigation at every supported viewport.

**Architecture:** Teleport the existing dialog from the learning section stacking context into `document.body`. Preserve all review behavior while constraining the sheet to the visual viewport and keeping its action row sticky above the mobile safe area.

**Tech Stack:** Vue 3, scoped CSS, Vitest, Testing Library Vue, Playwright.

## Global Constraints

- Do not change assessment API contracts or review decisions.
- Preserve 44 px minimum tap targets.
- Support 320, 390, 768, 1024 and 1440 px widths and mobile safe-area insets.

---

### Task 1: Move the review dialog to the document modal layer

**Files:**
- Modify: `apps/web/src/features/learning/AdminAssessmentReviewQueue.vue`
- Create: `apps/web/src/features/learning/adminAssessmentReviewQueue.test.ts`

**Interfaces:**
- Consumes: Existing `active`, `homework`, `quiz`, `comment` state and review handlers.
- Produces: A dialog rendered as a direct child of `document.body` with unchanged accessible name and actions.

- [x] **Step 1: Write the failing component test**

Render a pending homework queue, open the entry, and assert `dialog.parentElement === document.body` plus accessible «На доработку» and «Принять» buttons.

- [x] **Step 2: Run the focused test and verify the current nested dialog fails**

Run: `pnpm --filter @club/web test -- src/features/learning/adminAssessmentReviewQueue.test.ts`

- [ ] **Step 3: Implement the minimal document-layer dialog**

Wrap the conditional `.review-sheet` in `<Teleport to="body">` without changing its event handlers or API calls.

- [ ] **Step 4: Add viewport-safe sticky actions**

Give the overlay a modal-layer z-index, bound the panel with `100dvh`, add bottom safe-area padding, and make `.review-sheet__actions` plus the wide quiz action sticky at the panel bottom.

- [ ] **Step 5: Run focused component tests**

Run: `pnpm --filter @club/web test -- src/features/learning/adminAssessmentReviewQueue.test.ts`

### Task 2: Verify responsive behavior and publish

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/public/sw.js`
- Modify: matching release tests.

**Interfaces:**
- Consumes: Existing release metadata and service-worker cache sequence.
- Produces: The next visible release with an updated PWA shell cache.

- [ ] **Step 1: Run responsive visual checks**

Open the review sheet at mobile viewports, confirm the decision buttons are above navigation, and capture screenshots through the existing Playwright release configuration.

- [ ] **Step 2: Update release metadata test-first**

Advance the release and service-worker cache, then verify the release remains first and history has no version gap.

- [ ] **Step 3: Run full verification**

Run `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`.

- [ ] **Step 4: Commit, push, deploy and verify production**

Confirm the deployed commit, healthy containers, HTTP 200 health checks, current service worker, and no new production errors.
