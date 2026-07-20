# Profile Subpages Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the referral and appearance full-screen routes with the main profile header and content gutters while preserving referral behavior.

**Architecture:** Reuse the existing `TaskScreen` route shell and add a shared profile-detail modifier to the two profile subpages. Apply scoped mobile layout rules in the existing profile stylesheet, keeping API state and actions untouched.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite, PWA service worker.

## Global Constraints

- Preserve referral API behavior, activation rules, counters, and copy action.
- Keep route shells full-screen and safe-area aware.
- Use a 14 px shared mobile gutter matching `.profile-page-header`.
- Keep interactive controls at least 44×44 px.
- Do not introduce horizontal overflow from 320 px through 1440 px.

---

### Task 1: Shared profile detail layout

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/profile/ProfileSection.layout.test.ts`

**Interfaces:**
- Consumes: existing `TaskScreen`, `.profile-page-header`, referral state and handlers.
- Produces: `.profile-detail-task-screen` layout hook shared by referrals and appearance.

- [ ] **Step 1: Write the failing layout test**

Add assertions that both profile task screens use `profile-detail-task-screen`, the route header and body use the same 14 px mobile inset, cards stretch to the body width, referral URLs wrap, stats labels do not clip, and referral controls retain a 44 px target.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @club/web test -- src/features/profile/ProfileSection.layout.test.ts`

Expected: FAIL because the shared task-screen class and scoped layout rules do not exist.

- [ ] **Step 3: Implement the minimal layout**

Add `class="profile-detail-task-screen"` to the referral and appearance `TaskScreen` instances. Add scoped styles that keep the route layer full-screen, give header and body a matching 14 px inset, use the profile header radius, stretch the first card, wrap referral links safely, allow statistic labels to wrap, and preserve 44 px controls.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @club/web test -- src/features/profile/ProfileSection.layout.test.ts src/features/profile/profileSubscriptionCopy.test.ts`

Expected: both test files pass; referral behavior tests remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/profile/ProfileSection.vue apps/web/src/styles.css apps/web/src/features/profile/ProfileSection.layout.test.ts
git commit -m "fix: align profile detail screens"
```

### Task 2: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: current application version 5.27 and cache `club-pwa-v217`.
- Produces: version 5.28 and cache `club-pwa-v218`.

- [ ] **Step 1: Write failing release tests**

Expect version 5.28, a current release titled `Профиль: ровные внутренние экраны`, and service-worker cache `club-pwa-v218` while retaining the 5.27 chat-reaction entry.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @club/web test -- src/features/app/releaseNotes.test.ts src/features/app/pwa.test.ts`

Expected: FAIL on version, release title, and cache name.

- [ ] **Step 3: Implement release metadata**

Update the version, add Russian and English current release copy, preserve the previous release as 5.27, and bump the service-worker cache.

- [ ] **Step 4: Verify UI and repository**

Run the focused tests, browser audits at 320×720, 390×844, 768×1024, 1024×768, and 1440×900, then `pnpm test`, `pnpm build`, and `git diff --check`.

Expected: no horizontal overflow, no clipped profile detail content, all tests pass, and production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/sw.js apps/web/src/features/app/pwa.test.ts apps/web/src/features/app/releaseNotes.test.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/version.ts
git commit -m "chore: release profile detail layout as 5.28"
```
