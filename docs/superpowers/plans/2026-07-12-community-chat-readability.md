# Community Chat Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a calmer theme-aware chat, a wider contextual composer, and a visible pinned-message jump highlight.

**Architecture:** Keep message and theme data unchanged. Add chat-specific semantic CSS tokens in the canonical community stylesheet and small reactive UI state in `CommunitySection.vue`.

**Tech Stack:** Vue 3, TypeScript, CSS custom properties, Vitest.

## Global Constraints

- Preserve existing API contracts and message actions.
- Keep every composer control at a 44 px touch target.
- Apply the design to every theme and both light/dark modes through semantic tokens.
- Highlight pinned jumps for 1.8 seconds.

---

### Task 1: Theme-aware chat surfaces

**Files:**
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- Produces: `--chat-bubble-incoming`, `--chat-bubble-outgoing`, `--chat-bubble-border`, and `--chat-bubble-text`.

- [ ] Add failing assertions for semantic bubble tokens and removal of the saturated outgoing gradient.
- [ ] Run `pnpm --filter @club/web test -- communityMediaUi.test.ts` and confirm failure.
- [ ] Define the tokens from `--panel-strong`, `--accent`, `--border`, and `--text`; apply them to text, poll, voice, reply, and reaction surfaces.
- [ ] Run the focused test and confirm success.

### Task 2: Contextual composer

**Files:**
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- Produces: a `.chat-composer-shell` with attachment, emoji, input, and one contextual microphone/send action.

- [ ] Add failing assertions for `.chat-composer-shell`, `newMessage.trim()`, and mutually exclusive microphone/send controls.
- [ ] Run the focused test and confirm failure.
- [ ] Update template and CSS while retaining `handleSendMessage`, `voiceRecorder.start`, and 44 px targets.
- [ ] Run the focused test and confirm success.

### Task 3: Pinned jump highlight

**Files:**
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityArchive.test.ts`

**Interfaces:**
- Produces: `highlightedMessageId` state and `.chat-message-jump-highlight` class.

- [ ] Add failing assertions that `scrollToMessage` sets the highlighted ID and schedules a 1,800 ms reset.
- [ ] Run `pnpm --filter @club/web test -- communityArchive.test.ts` and confirm failure.
- [ ] Add the reactive state, replaceable timer, article class, focus ring, and reduced-motion-safe animation.
- [ ] Run the focused test and confirm success.

### Task 4: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`

- [ ] Update release tests first and confirm they fail.
- [ ] Publish the next patch version and cache revision.
- [ ] Run `pnpm test`, `pnpm check`, `pnpm build`, and `git diff --check`.
- [ ] Commit, push `main`, wait for deploy success, and verify production version, assets, service worker, and health endpoint.
