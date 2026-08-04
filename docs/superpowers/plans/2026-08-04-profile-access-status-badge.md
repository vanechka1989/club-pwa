# Profile Access Status Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the large product summary in the profile header with a responsive access-state badge and move product details into the compact membership strip.

**Architecture:** Keep the existing `CurrentAccess` data and payment policy unchanged. Add one pure access-state resolver, render its result in the identity row, and reuse the current product metadata in the lower strip. Apply final scoped CSS overrides for responsive geometry.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright, pnpm.

## Global Constraints

- Use the labels «Доступ активен», «Заканчивается», «Нет доступа» and «Нет активного продукта» in Russian with English equivalents.
- Treat an active expiring access with three or fewer days remaining as `ending`; active access without an expiry remains `active`.
- Preserve current renewal and recurring-subscription behavior.
- Keep icon actions at least 44×44 px and avoid horizontal overflow at 320 px.

---

### Task 1: Access-state resolver

**Files:**
- Modify: `apps/web/src/features/profile/profileSubscriptionCopy.ts`
- Modify: `apps/web/src/features/profile/profileSubscriptionCopy.test.ts`

**Interfaces:**
- Produces: `getProfileAccessState({ isMember, expiresAt, daysLeft }): "active" | "ending" | "inactive"`.

- [ ] Add tests for active, ending, inactive and non-expiring access.
- [ ] Run the focused test and confirm it fails because the resolver does not exist.
- [ ] Implement the minimal pure resolver.
- [ ] Run the focused test and confirm it passes.

### Task 2: Profile markup and responsive styling

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/profileRoute.css`
- Modify: `apps/web/src/features/profile/ProfileSection.layout.test.ts`
- Modify: `apps/web/src/features/app/i18n.ts`

**Interfaces:**
- Consumes: `getProfileAccessState` from Task 1 and the existing `profileCurrentAccess`, `profileAccessMetaText`, `accessUntil`, `subscriptionProgress`, and `subscriptionMeta` computed values.
- Produces: `.profile-access-state`, its tone modifiers, and `.profile-membership-source`.

- [ ] Add layout assertions for the badge position, removal of the old header summary, product title in the lower strip, and responsive wrapping.
- [ ] Run the focused layout test and confirm the new assertions fail.
- [ ] Add localized state/fallback labels and computed badge state/text.
- [ ] Move product title, metadata and expiry into the lower strip and remove the old summary section.
- [ ] Add scoped responsive styles for active, ending and inactive badge tones.
- [ ] Run focused profile tests and confirm they pass.

### Task 3: Browser regression and release

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: corresponding release and PWA tests.

**Interfaces:**
- Verifies the public profile layout and publishes the next app/cache version.

- [ ] Update the profile E2E test to assert the state badge follows the camera button and product details appear in the lower strip.
- [ ] Run the E2E test at 320, 390 and 768 px and inspect light/dark screenshots.
- [ ] Update release notes, history and the service-worker cache with test-first assertions.
- [ ] Run `pnpm check`, `pnpm test`, `pnpm build` and focused Playwright checks.
- [ ] Commit, push `main`, monitor the deployment workflow and verify production health, readiness, release version and service-worker cache.
