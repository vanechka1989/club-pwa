# Automatic Learning Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically and reliably mark learning cards complete from active viewing evidence.

**Architecture:** Add a pure completion-policy module and a small localStorage outbox. Integrate both into the existing engagement tracker and lesson viewer without changing server schemas or the admin aggregation.

**Tech Stack:** Vue 3, TypeScript, Vitest, existing REST API and localStorage outbox pattern.

## Global Constraints

- Static threshold: 10 active seconds plus content end.
- Native media threshold: 80% position plus `min(10 seconds, 20% duration)` active playback.
- Completion is idempotent and retryable offline.
- Do not count hidden or unfocused time.

---

### Task 1: Completion policy

**Files:**
- Create: `apps/web/src/features/learning/learningCompletion.ts`
- Create: `apps/web/src/features/learning/learningCompletion.test.ts`
- Modify: `apps/web/src/features/learning/learningEngagement.ts`
- Test: `apps/web/src/features/learning/learningEngagement.test.ts`

**Interfaces:**
- Produces: `shouldAutoCompleteLearningContent(evidence): boolean` and `tracker.currentSnapshot()`.

- [ ] Add failing source and behavior tests.
- [ ] Implement static and native-media thresholds.
- [ ] Expose a current cumulative tracker snapshot.
- [ ] Run focused tests.

### Task 2: Retryable completion delivery

**Files:**
- Create: `apps/web/src/features/learning/learningCompletionOutbox.ts`
- Create: `apps/web/src/features/learning/learningCompletionOutbox.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `queueLearningCompletion(id)` and `flushLearningCompletionOutbox()`.

- [ ] Test deduplication and delivered-entry removal.
- [ ] Add `keepalive` support to `completeLearningContent`.
- [ ] Implement serialized localStorage delivery.
- [ ] Run focused tests.

### Task 3: Lesson viewer integration

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Test: `apps/web/src/features/learning/learningEngagementIntegration.test.ts`

**Interfaces:**
- Consumes: completion policy, current snapshot, and outbox.
- Produces: automatic checks on scroll, media progress, periodic activity, exit, and application start.

- [ ] Add a failing integration contract test.
- [ ] Track content end and primary media progress.
- [ ] Queue completion once and update local progress once.
- [ ] Clean up timers and listeners on close/unmount.
- [ ] Run learning tests.

### Task 4: Release and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Produces: the next visible application release.

- [ ] Update release metadata with exact completion rules.
- [ ] Run all tests, type checks, and production build.
- [ ] Deploy and verify health, readiness, commit, and production assets.
