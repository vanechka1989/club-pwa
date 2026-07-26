# Compact Detail Screens and Support List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand profile detail screens, keep module visibility controls reachable, and present support requests as compact rows.

**Architecture:** Preserve the existing Vue routed task screens and business state. Change only component composition and route-owned CSS, with behavior tests for module visibility and layout contract tests for profile/support geometry.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Testing Library, CSS, Playwright.

## Global Constraints

- Do not change API contracts, persistence rules, ticket ordering, or payment behavior.
- Keep touch targets at least 44 px.
- Preserve all existing themes through semantic CSS variables.
- Support 320 px mobile layouts and scaled Android/PWA layouts without horizontal overflow.

---

### Task 1: Profile detail surfaces

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/profileRoute.css`
- Test: `apps/web/src/features/profile/ProfileSection.layout.test.ts`

**Interfaces:**
- Consumes: existing `TaskScreen`, referral state, and UI theme store.
- Produces: `.profile-detail-content`, `.profile-referral-summary`, and `.profile-appearance-content` layout hooks.

- [ ] **Step 1: Write the failing layout tests**

Assert that both detail screens use `profile-detail-content`, do not wrap content in a redundant `soft-card ui-card`, and that the late route CSS removes outer surface decoration while preserving full width.

- [ ] **Step 2: Run the profile layout test and verify the expected failure**

Run: `pnpm --filter @club/web test -- src/features/profile/ProfileSection.layout.test.ts`

Expected: FAIL because the new detail hooks and undecorated surface rules do not exist.

- [ ] **Step 3: Implement the profile composition**

Remove duplicated referral/appearance headings, add a compact referral summary, and apply full-width detail surface classes without changing event handlers or computed state.

- [ ] **Step 4: Run the profile layout test**

Run: `pnpm --filter @club/web test -- src/features/profile/ProfileSection.layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/profile/ProfileSection.vue apps/web/src/features/profile/profileRoute.css apps/web/src/features/profile/ProfileSection.layout.test.ts
git commit -m "fix: expand profile detail screens"
```

### Task 2: Reachable module visibility action

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Test: `apps/web/src/features/learning/learningArchive.test.ts`
- Test: `apps/web/src/features/learning/learningTaskScreens.test.ts`

**Interfaces:**
- Consumes: existing `modulePublished` draft state and `saveModule`.
- Produces: `.module-editor-visibility` footer action with dynamic accessible name and `aria-pressed`.

- [ ] **Step 1: Write failing behavior and layout tests**

Open an existing published module, verify `Скрыть модуль` is inside `.task-screen-footer`, activate it, then verify `Опубликовать модуль` and `aria-pressed="false"`. Verify CSS reserves a compact full-width footer row.

- [ ] **Step 2: Run focused learning tests and verify the expected failure**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts src/features/learning/learningTaskScreens.test.ts`

Expected: FAIL because publication is still a checkbox inside the scrollable body.

- [ ] **Step 3: Implement the footer visibility button**

Move publication state control to the sticky footer, use dynamic Russian action copy, preserve draft defaults, and reset the task body scroll position on open through the shared routed task component.

- [ ] **Step 4: Run focused learning tests**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts src/features/learning/learningTaskScreens.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/app/TaskScreen.vue apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css apps/web/src/features/learning/learningArchive.test.ts apps/web/src/features/learning/learningTaskScreens.test.ts
git commit -m "fix: keep module visibility action reachable"
```

### Task 3: Compact administrative support rows

**Files:**
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/support/supportRoute.css`
- Test: `apps/web/src/features/support/supportSection.test.ts`
- Test: `apps/web/src/App.test.ts`

**Interfaces:**
- Consumes: existing sorted `tickets`, status helpers, and `openTicket`.
- Produces: `.support-ticket-list-heading` and compact `.support-admin-ticket` rows.

- [ ] **Step 1: Write failing support layout tests**

Assert that the request list is not a nested `surface-card`, mobile rows have a 64 px compact minimum height, modest padding, a divider, no oversized radius, and enough bottom scroll padding.

- [ ] **Step 2: Run focused support tests and verify the expected failure**

Run: `pnpm --filter @club/web test -- src/features/support/supportSection.test.ts src/App.test.ts`

Expected: FAIL because the current late mobile rules enforce 100 px rounded cards.

- [ ] **Step 3: Implement the compact request list**

Promote `Запросы клиентов` to a standalone heading and override late mobile rules with full-width divided rows, wrapping metadata, and navigation clearance.

- [ ] **Step 4: Run focused support tests**

Run: `pnpm --filter @club/web test -- src/features/support/supportSection.test.ts src/App.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/support/SupportSection.vue apps/web/src/features/support/supportRoute.css apps/web/src/features/support/supportSection.test.ts apps/web/src/App.test.ts
git commit -m "fix: compact admin support requests"
```

### Task 4: Visual verification and release

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: existing mocked authenticated release E2E fixtures.
- Produces: release version 5.65 and a new service-worker cache version.

- [ ] **Step 1: Add browser geometry assertions**

Verify the profile detail surface reaches the task body width, module visibility stays in the visible footer, support rows do not overlap, and the final request can scroll clear of navigation.

- [ ] **Step 2: Run focused E2E and capture mobile screenshots**

Run the relevant Chromium/Android fixture tests at 320, 390, 768, 1024, and 1440 px.

- [ ] **Step 3: Update release metadata**

Set `currentRelease.version` to `5.65`, record the three UI changes in release notes, and increment the service-worker cache from `club-pwa-v236` to `club-pwa-v237`.

- [ ] **Step 4: Run complete verification**

Run:

```bash
pnpm test
pnpm check
pnpm build
pnpm test:e2e:release
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/web/src/features/app/releaseNotes.ts apps/web/public/sw.js tests/e2e/app.spec.ts
git commit -m "chore: release version 5.65"
```
