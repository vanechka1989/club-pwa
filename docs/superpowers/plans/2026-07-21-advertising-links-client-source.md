# Advertising Links And Client Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename acquisition analytics to advertising links and reduce the client acquisition card to one source with UTM values.

**Architecture:** Keep the existing API contract intact and simplify only the presentation layer. Reuse `lastTouch` as the single attributed source so dashboard and client card remain consistent.

**Tech Stack:** Vue 3, TypeScript, Vitest, existing PWA design tokens.

## Global Constraints

- Do not change acquisition data collection or attribution logic.
- Keep the client card responsive from 320 to 1440 px.
- Remove the analytics navigation event from the client source component.

---

### Task 1: Regression contract

**Files:**
- Modify: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`

- [ ] Replace the old first/last-touch assertion with assertions for one source and explicit UTM rows.
- [ ] Assert that campaign analytics, milestones, and visit history are absent.
- [ ] Assert the analytics navigation copy contains «Рекламные ссылки» and «UTM-метки и результаты».
- [ ] Run `pnpm --filter @club/web test -- adminAcquisitionAnalytics.test.ts` and confirm it fails because production templates still use the old UI.

### Task 2: Minimal interface change

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientAcquisition.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`

- [ ] Replace the expandable attribution journey with one source card and UTM key/value rows based on `lastTouch`.
- [ ] Remove the component event and its unused handler.
- [ ] Rename the analytics navigation and task-screen copy.
- [ ] Run the focused test and confirm it passes.

### Task 3: Verification and release

**Files:**
- No additional source files.

- [ ] Run web tests, type checking, and production build.
- [ ] Check 320, 390, 768, 1024 and 1440 px without horizontal overflow.
- [ ] Commit, push `main`, deploy with `/opt/club-pwa/deploy/update.sh`, and verify HTTP 200 plus the deployed commit.
