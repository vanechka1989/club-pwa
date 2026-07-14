# App Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every browser-native confirmation, alert, and prompt in the PWA UI with accessible, theme-aware application dialogs and notifications.

**Architecture:** A Pinia `appDialogs` store owns one Promise-based global confirm or prompt request. A single `AppDialogHost` mounted in `App.vue` renders it, while existing feature sections call the store instead of duplicating modal state or invoking browser APIs. Existing local `ConfirmDialog` consumers remain supported and receive the same polished visual foundation.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, lucide-vue-next, existing semantic CSS tokens.

## Global Constraints

- No production call to `window.confirm`, `window.alert`, or `window.prompt` may remain under `apps/web/src`.
- Preserve all existing API calls and business behavior.
- Minimum interactive target is 44×44px.
- Dialogs support active themes, keyboard focus, Escape, backdrop cancellation, and reduced motion.
- Informational one-way messages use the existing notifications store.

---

### Task 1: Promise-based dialog store

**Files:**
- Create: `apps/web/src/stores/appDialogs.ts`
- Create: `apps/web/src/stores/appDialogs.test.ts`

**Interfaces:**
- Produces: `confirm(options): Promise<boolean>`, `prompt(options): Promise<string | null>`, `cancel()`, `confirmActive()`, `submitPrompt(value)`.

- [ ] Write failing store tests for confirm acceptance/cancellation, prompt submission, and replacement of an unresolved request.
- [ ] Run `pnpm --filter @club/web test -- src/stores/appDialogs.test.ts` and verify failures because the store is missing.
- [ ] Implement the discriminated dialog state and Promise resolvers; resolve a displaced request safely before opening another.
- [ ] Run the focused test and verify all cases pass.

### Task 2: Global accessible dialog host

**Files:**
- Create: `apps/web/src/features/app/AppDialogHost.vue`
- Create: `apps/web/src/features/app/AppDialogHost.test.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `useAppDialogsStore()` and its active dialog.
- Produces: one global themed `alertdialog` with neutral, danger, and prompt variants.

- [ ] Write failing component/source tests for title/description linkage, danger styling, labelled prompt input, Escape, backdrop cancellation, initial safe focus, focus trapping, busy-safe buttons, and root mounting.
- [ ] Run focused tests and confirm failures because the host is missing.
- [ ] Implement the teleported host with Lucide status icon, 44px controls, validation message, focus restoration, Escape/backdrop handling, and focus trap.
- [ ] Add semantic responsive styling using existing surface, border, accent, danger, text and shadow tokens; add reduced-motion handling.
- [ ] Mount the host once in `App.vue`.
- [ ] Run focused tests and verify they pass.

### Task 3: Replace all browser-native calls

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/App.vue`
- Create: `apps/web/src/features/app/nativeDialogGuard.test.ts`

**Interfaces:**
- Consumes: `useAppDialogsStore().confirm()` and `.prompt()`.
- Uses: existing notification store for alert-only messages.

- [ ] Write a failing guard test that scans production `.ts` and `.vue` files and rejects `window.confirm(`, `window.alert(`, and `window.prompt(`.
- [ ] Run the guard and verify it reports the current 15 production call sites.
- [ ] Replace learning deletion confirmations with danger dialogs.
- [ ] Replace tariff/subscription confirmations with neutral or danger dialogs according to consequence.
- [ ] Replace community mass deletion confirmation; remove duplicate native mute alert while retaining themed notification.
- [ ] Replace admin storage/category/material confirmations and link prompt; remove duplicate native admin alert.
- [ ] Remove the duplicate native application alert while retaining the notification-center message.
- [ ] Run the guard and affected feature tests until all pass.

### Task 4: Regression, localization, version and release

**Files:**
- Modify: `apps/web/src/features/app/interfaceLocalization.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

- [ ] Add Russian/English phrases introduced by the shared dialog and tests for the current release.
- [ ] Increase the application version and service-worker cache version.
- [ ] Run `pnpm test`, `pnpm build`, and `git diff --check`; require exit code 0.
- [ ] Audit production UI at 320, 390, 768, 1024, and 1440px, checking overflow, contrast, focus, and button layout.
- [ ] Commit, push, deploy with `deploy/update.sh`, then verify API health, new asset hash, new version, service-worker cache, and absence of native calls in the production source/bundle.
