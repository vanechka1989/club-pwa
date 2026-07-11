# Edge-to-edge Chat Admin Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat header and composer edge-to-edge, keep the composer at the viewport bottom for every message count, and replace overlapping moderation buttons with a mobile action sheet.

**Architecture:** Preserve the existing chat APIs and state. Change the open-chat shell to one full-height grid, move moderation actions into an accessible overlay rendered from the selected message, and use safe-area-aware internal padding rather than outer width constraints.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite.

## Global Constraints

- Preserve community routes, requests, roles and moderation behavior.
- Keep one vertical scroller: `.chat-messages`.
- Every moderation action target is at least 48 px high.
- Support all four existing theme combinations through semantic tokens.
- Do not use fixed desktop viewport heights or horizontal clipping.

---

### Task 1: Reproduce the layout and moderation regressions

**Files:**
- Modify: `apps/web/src/features/community/communityArchive.test.ts`

**Interfaces:**
- Consumes: `CommunitySection.vue` template and `styles.css` source.
- Produces: regression assertions for `.community-chat-shell`, `.chat-room`, `.chat-compose` and `.moderation-action-sheet`.

- [ ] **Step 1: Write failing assertions**

Assert that the open chat escapes padded ancestors, the grid reaches the shell block edges, the composer uses left/right safe-area padding, an action sheet exists, and `.moderation-menu` is absent from the message bubble.

- [ ] **Step 2: Verify RED**

Run `pnpm --filter @club/web test -- communityArchive.test.ts` and expect the new assertions to fail because the current inline moderation menu and constrained chat shell remain.

### Task 2: Implement the edge-to-edge chat shell

**Files:**
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `.community-chat-open`, `.content-panel-community`, `.section-host`, `.community-chat-shell`, `.chat-room`.
- Produces: a full-width, full-height four-row room whose composer is always the last row.

- [ ] **Step 1: Remove ancestor constraints for the open-chat route**

Set the content host and its direct section to `width: 100%`, `max-width: none`, `height: 100%`, `min-height: 0`, zero outer padding/margin and zero border radius.

- [ ] **Step 2: Make the room grid consume all available block space**

Use `grid-template-rows: auto auto minmax(0, 1fr) auto`, `align-self: stretch`, and `min-height: 0`; keep `.chat-messages` as the only `overflow-y: auto` element.

- [ ] **Step 3: Extend header and composer backgrounds to the edges**

Give both elements `width: 100%`, `margin: 0`, `border-radius: 0`, and explicit left/right padding using `--club-safe-left` and `--club-safe-right`. Give the composer bottom padding using `--club-safe-bottom`.

### Task 3: Replace inline moderation actions with an action sheet

**Files:**
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `activeModerationMessageId`, `handleModerateMessage`, `handleTogglePin`, `handleMuteAuthor`, `handleDeleteAuthorMessages`.
- Produces: `activeModerationMessage` computed state and `.moderation-action-sheet` overlay.

- [ ] **Step 1: Add selected-message state lookup and close behavior**

Derive the selected message from `orderedMessages` and clear `activeModerationMessageId` on cancel, backdrop, Escape and successful actions.

- [ ] **Step 2: Remove the inline button row**

Delete the `.moderation-menu` block from each message bubble while keeping the existing message trigger.

- [ ] **Step 3: Render the accessible action sheet once per room**

Add a backdrop with a bottom-aligned `role="dialog"`, labelled title, four action rows, semantic danger styling and a separate cancel button.

- [ ] **Step 4: Style touch-friendly rows**

Use the existing surface, border, text, muted, primary and danger tokens. Rows use `min-height: 48px`; the panel accounts for the bottom safe area and fits at 320 px without horizontal overflow.

### Task 4: Verify, version and deploy

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: app version `3.66` and cache `club-pwa-v67`.

- [ ] **Step 1: Verify GREEN**

Run `pnpm --filter @club/web test -- communityArchive.test.ts foundation.test.ts App.test.ts pwa.test.ts releaseNotes.test.ts` and expect all tests to pass.

- [ ] **Step 2: Run production builds**

Run `pnpm --filter @club/api build` and `pnpm --filter @club/web build`; both must exit 0.

- [ ] **Step 3: Update release metadata**

Set version to `3.66`, service-worker cache to `club-pwa-v67`, and add a release note describing edge-to-edge chat and the admin sheet.

- [ ] **Step 4: Commit, push and deploy**

Commit to `main`, push `origin main`, run the existing server deployment, and verify `/api/health`, version `3.66`, cache `v67`, the production commit and running containers.
