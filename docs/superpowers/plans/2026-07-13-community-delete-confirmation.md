# Community Delete Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser confirmation used for deleting all messages in a community topic with the shared themed in-app confirmation dialog.

**Architecture:** Keep the existing API call and refresh sequence in `CommunitySection.vue`. Add local dialog and busy state, open the shared `ConfirmDialog` from the admin menu, and execute deletion only from the dialog's confirm event.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, existing `ConfirmDialog.vue` and semantic CSS tokens.

## Global Constraints

- Do not change deletion API semantics.
- Reuse the existing shared confirmation component and theme tokens.
- Keep every interactive target at least 44 px high.
- Do not use `window.confirm` for deleting all topic messages.

---

### Task 1: Add the themed confirmation flow

**Files:**
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Test: `apps/web/src/features/community/communityArchive.test.ts`

**Interfaces:**
- Consumes: `ConfirmDialog` props `open`, `title`, `description`, `confirmLabel`, `danger`, `busy` and events `cancel`, `confirm`.
- Produces: local refs `showDeleteTopicMessagesConfirm` and `deleteTopicMessagesBusy`, plus open/cancel/confirm handlers.

- [ ] **Step 1: Write the failing test**

Add assertions that the community source imports and renders `ConfirmDialog`, passes `danger` and `busy`, uses «Удалить всё», and no longer calls `window.confirm` inside `handleDeleteTopicMessages`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- communityArchive.test.ts`

Expected: FAIL because `ConfirmDialog` and dialog state are absent.

- [ ] **Step 3: Write minimal implementation**

Import `ConfirmDialog`, add the two refs, replace the menu action with an opener that closes the menu, and move the existing delete/refresh sequence into an async confirm handler guarded by `deleteTopicMessagesBusy`.

- [ ] **Step 4: Render the shared dialog**

Add a `ConfirmDialog` at the component root with owner-aware description, `confirm-label="Удалить всё"`, `danger`, `busy`, and cancel/confirm event handlers.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @club/web test -- communityArchive.test.ts communityMediaUi.test.ts`

Expected: PASS.

- [ ] **Step 6: Verify the application**

Run: `pnpm check && pnpm build && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/community/CommunitySection.vue apps/web/src/features/community/communityArchive.test.ts docs/superpowers/plans/2026-07-13-community-delete-confirmation.md
git commit -m "fix: use in-app chat deletion confirmation"
```

### Task 2: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`
- Test: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: application version `4.09` and service-worker cache `club-pwa-v110`.

- [ ] **Step 1: Update release tests first**

Expect version `4.09`, a release note for the in-app delete confirmation, and cache `club-pwa-v110`.

- [ ] **Step 2: Run release tests to verify they fail**

Run: `pnpm --filter @club/web test -- releaseNotes.test.ts pwa.test.ts`

Expected: FAIL with old version/cache values.

- [ ] **Step 3: Update release metadata**

Set version to `4.09`, current release timestamp, add the release note, and bump the service-worker cache to `v110`.

- [ ] **Step 4: Run release and full tests**

Run: `pnpm test && pnpm check && pnpm build`

Expected: PASS.

- [ ] **Step 5: Push and deploy**

Push `main`; deployment on `club2.myn8nservertest.ru` must use `/opt/club-pwa` on `2.27.28.89`.

- [ ] **Step 6: Verify production**

Confirm `/api/health` returns `{ "ok": true }`, the remote commit matches `main`, assets contain version `4.09`, and `sw.js` contains `club-pwa-v110`.
