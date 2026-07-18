# Bottom Navigation Position Implementation Plan

> **For agentic workers:** Execute this plan with `superpowers:executing-plans`; keep the change local to the main mobile navigation.

**Goal:** Add a persistent Appearance toggle that lets users with gesture navigation pin the main bottom menu to the physical screen edge without moving chat, support, or other fixed controls.

**Architecture:** Store one boolean preference in the existing UI store and mirror it as a class on the document root. Render a compact switch in the existing Appearance panel. Use a narrowly scoped mobile CSS selector so only `.mobile-bottom-nav` changes its external bottom offset, while `env(safe-area-inset-bottom)` remains internal padding.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, CSS, Vite PWA.

## Global Constraints

- Default behavior must remain unchanged for existing users.
- The preference must survive reloads.
- The setting must affect only the main mobile bottom menu.
- iOS home-indicator and Android gesture safe areas remain protected.
- Desktop sidebar behavior must not change.
- RU and EN labels are required.

---

### Task 1: Persistent UI preference

**Files:**
- Modify: `apps/web/src/stores/ui.test.ts`
- Modify: `apps/web/src/stores/ui.ts`

1. Add failing tests for default state, saved-state restoration, persistence, and the document-root class.
2. Run `npm run test -- apps/web/src/stores/ui.test.ts` and confirm the tests fail because the preference is absent.
3. Add `bottomNavigationFlush`, its storage key, root-class synchronization, and `setBottomNavigationFlush` to the UI store.
4. Re-run the focused test and confirm it passes.

### Task 2: Appearance control and localization

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`

1. Add failing contract/render tests for the compact Appearance switch and RU/EN strings.
2. Run the focused test and confirm the missing control causes the expected failure.
3. Add a compact accessible switch below the interface scale control.
4. Add Russian and English label/help text.
5. Re-run the focused test.

### Task 3: Mobile positioning and safe area

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`

1. Add a failing CSS contract test requiring a root-class selector scoped to `.mobile-bottom-nav`, `bottom: 0`, and retained safe-area padding.
2. Run the test and confirm it fails before CSS is added.
3. Add the mobile-only flush rule and compensate page content spacing without affecting desktop or chat controls.
4. Re-run focused tests.

### Task 4: Release verification and deployment

**Files:**
- Modify version/service-worker release files following the repository release convention.

1. Run type checking, full unit tests, production build, and the repository audit command.
2. Bump the application version and service-worker cache version.
3. Re-run release-sensitive tests and build.
4. Commit, push `main`, monitor deployment to success, and verify the production version and service worker.

