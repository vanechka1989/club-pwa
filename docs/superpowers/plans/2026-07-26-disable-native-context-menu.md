# Disable Native Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress browser context menus and mobile long-press callouts throughout the PWA without breaking form editing.

**Architecture:** A small application utility owns target classification and listener lifecycle. `App.vue` installs it for the application lifetime, while global CSS provides the WebKit-specific callout suppression and editable-control exceptions.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library, CSS, Playwright.

## Global Constraints

- Preserve native editing actions in `input`, `textarea`, `select`, and contenteditable regions.
- Preserve all existing click, pointer, scroll, zoom, keyboard, file-picker, and accessibility behavior.
- Provide `[data-native-context-menu]` as an explicit escape hatch.
- Release as version 5.66 and service-worker cache v238.

---

### Task 1: Context-menu policy

**Files:**
- Create: `apps/web/src/features/app/nativeContextMenu.ts`
- Create: `apps/web/src/features/app/nativeContextMenu.test.ts`

**Interfaces:**
- Produces: `shouldAllowNativeContextMenu(target: EventTarget | null): boolean`
- Produces: `installNativeContextMenuGuard(root?: Document): () => void`

- [ ] **Step 1: Write failing behavioral tests**

Test that a cancellable `contextmenu` event is prevented on a button and link, but not on form controls, descendants of a contenteditable ancestor, or `[data-native-context-menu]`.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm --filter @club/web test -- src/features/app/nativeContextMenu.test.ts`

Expected: FAIL because `nativeContextMenu.ts` does not exist.

- [ ] **Step 3: Implement the minimal policy**

Use `Element.closest()` with `input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-native-context-menu]`. Prevent the default only when no allowed ancestor exists and return an idempotent cleanup function.

- [ ] **Step 4: Verify the focused tests pass**

Run: `pnpm --filter @club/web test -- src/features/app/nativeContextMenu.test.ts`

- [ ] **Step 5: Commit**

Commit the policy and its tests with `fix: disable native context menu`.

### Task 2: Application lifecycle and iOS callout

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.ts`

**Interfaces:**
- Consumes: `installNativeContextMenuGuard(document)` and its cleanup callback.

- [ ] **Step 1: Write failing application tests**

Mount the real app, dispatch context-menu events against ordinary and editable UI, and assert the differing `defaultPrevented` values. Unmount and verify the guard no longer handles a detached test target attached to the document.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm --filter @club/web test -- src/App.test.ts`

Expected: FAIL because the application does not install the guard.

- [ ] **Step 3: Connect lifecycle and CSS**

Install the guard in `onMounted`, call its cleanup in `onBeforeUnmount`, set `-webkit-touch-callout: none` on `#app`, and restore `default` on editable controls and escape-hatch regions.

- [ ] **Step 4: Verify focused tests pass**

Run: `pnpm --filter @club/web test -- src/App.test.ts src/features/app/nativeContextMenu.test.ts`

- [ ] **Step 5: Commit**

Commit the lifecycle and CSS integration with `fix: suppress long press callouts`.

### Task 3: Release and verification

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces: app version `5.66` and service-worker cache `club-pwa-v238`.

- [ ] **Step 1: Add failing release and browser assertions**

Assert the new version/cache metadata and verify ordinary UI context menus are prevented while a login email field remains editable.

- [ ] **Step 2: Verify failures**

Run the focused release tests and targeted release E2E.

- [ ] **Step 3: Update release metadata**

Add a concise 5.66 release note, retain the 5.65 history item, and bump the service-worker cache to v238.

- [ ] **Step 4: Run complete verification**

Run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:release`.

- [ ] **Step 5: Commit and deploy**

Commit the release, fast-forward `main`, push it, wait for CI/deploy, then verify production health, commit marker, and service-worker v238.
