# Learning Search, Progress, and Quiz Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact module discovery, understandable progress, and secure per-question quiz results.

**Architecture:** Keep discovery filtering client-side but move its presentation into a header-anchored member panel. Extend the member-owned assessment status response with immutable attempt snapshots only after submission, then render a focused result breakdown in the existing assessment player.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle/PostgreSQL, Vitest, Testing Library, Playwright.

## Global Constraints

- Never expose `correctOptionIds` for an `in_progress` attempt.
- Only expose attempts belonging to the authenticated member and requested published lesson.
- Preserve existing administrator header actions.
- Maintain 44×44 px controls and prevent horizontal overflow from 320 px upward.

---

### Task 1: Secure submitted-attempt result contract

**Files:**
- Modify: `apps/api/src/routes/learning.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/api/src/learning/assessmentStatusResult.test.ts`

**Interfaces:**
- Produces `LessonAssessmentStatus.attempts[].questions` only for submitted attempts.
- Each result question contains prompt/type/points/options, selected answer, correct option IDs, and earned points.

- [ ] Write a failing contract test proving submitted attempts include review data while in-progress attempts do not expose correct answers.
- [ ] Run the focused API test and verify the disclosure assertion fails.
- [ ] Load attempt questions and answers for authenticated member attempts, calculate per-question awarded points, and serialize review data only outside `in_progress`.
- [ ] Update the web API type and rerun the focused test until green.

### Task 2: Completed quiz breakdown

**Files:**
- Modify: `apps/web/src/features/learning/LessonAssessmentPlayer.vue`
- Test: `apps/web/src/features/learning/lessonAssessmentPlayer.test.ts`

**Interfaces:**
- Consumes the submitted-attempt `questions` review array from Task 1.
- Produces accessible correct/incorrect question cards with answer labels and points.

- [ ] Replace the old result expectation with a failing test for concise summary and per-question answer review.
- [ ] Run the focused component test and verify the review is absent.
- [ ] Render summary, selected answer, correct answer, correctness icon/text, and points; remove duplicate condition/result cards.
- [ ] Rerun the component test until green.

### Task 3: Header discovery panel

**Files:**
- Modify: `apps/web/src/features/learning/LearningDiscoveryToolbar.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Test: `apps/web/src/features/learning/learningDiscoveryToolbar.test.ts`
- Test: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Produces a member-only header search trigger and anchored panel using the existing discovery query/filter events.

- [ ] Write failing tests for opening, focus, active state, filtering, closing, and absence of the old feed toolbar.
- [ ] Run focused web tests and confirm the expected failures.
- [ ] Add panel state and accessible trigger in the page header, convert the toolbar to a compact panel, and preserve administrator actions.
- [ ] Add responsive styles and rerun focused tests until green.

### Task 4: Explicit progress presentation

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Test: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Consumes existing `overallProgressPercent` and `moduleProgress(module)` values.
- Produces explicit percentage, completed/total text, status text, and labelled progress rails.

- [ ] Write a failing member test for overall/module percentage and status copy.
- [ ] Run the focused test and verify the new labels are absent.
- [ ] Implement the overall and module progress layouts with zero/partial/complete states.
- [ ] Rerun focused discovery and member tests until green.

### Task 5: Release and production verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: relevant release/PWA tests

**Interfaces:**
- Produces the next visible application version and service-worker cache revision.

- [ ] Add failing release expectations and update release metadata/cache version.
- [ ] Run focused tests, full test suite, checks, and production build.
- [ ] Inspect 320, 390, 768, 1024, and 1440 px layouts and resolve overflow or interaction defects.
- [ ] Commit, push `main`, deploy with `DEPLOY_DIR=/opt/club-crm`, then verify production health, readiness, version, and service worker.
