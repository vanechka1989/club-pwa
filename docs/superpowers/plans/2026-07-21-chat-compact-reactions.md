# Compact Chat Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make module scrolling visually clean and chat reactions, pinned messages, and reaction selection compact and viewport-safe.

**Architecture:** Preserve all API and message state behavior. Adjust the Vue render hierarchy so reactions have an external absolute anchor and the reaction palette is teleported outside clipped chat ancestors; use CSS for compact geometry and scrollbar presentation.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS, Vite, pnpm.

## Global Constraints

- Do not change backend contracts or message/reaction persistence.
- Preserve swipe-to-reply, moderation, pinning, and message ordering.
- Support 320, 390, 768, 1024, and 1440 px widths.
- Keep scrolling functional while hiding only the editor scrollbar chrome.

---

### Task 1: Lock the required layout with failing tests

**Files:**
- Modify: `apps/web/src/features/community/communityMediaUi.test.ts`
- Modify: `apps/web/src/features/community/communityArchive.test.ts`
- Modify: `apps/web/src/features/learning/learningTaskScreens.test.ts`

**Interfaces:**
- Consumes: current Vue source and canonical CSS files.
- Produces: regression contracts for external reactions, body-level palette, collapsible pins, and hidden scrollbar.

- [ ] Add assertions for `.chat-message-content`, external `.message-reactions`, teleported `.reaction-popover`, `aria-expanded`, collapsed pinned details, and learning scrollbar hiding.
- [ ] Run the three focused test files and confirm failures identify the missing behaviors.

### Task 2: Implement chat structure and interaction

**Files:**
- Modify: `apps/web/src/features/community/CommunitySection.vue`

**Interfaces:**
- Consumes: `activeReactionMessageId`, `showPinnedMessages`, existing reaction handlers.
- Produces: `activeReactionMessage`, teleported palette, message content wrapper, and collapsible pinned markup.

- [ ] Add a computed active reaction message.
- [ ] Move applied reactions outside `.chat-bubble` into `.chat-message-content`.
- [ ] Render the active palette once through `Teleport to="body"`.
- [ ] Convert pinned content to a compact accessible toggle and conditional detail region.
- [ ] Run focused tests and confirm Vue structure contracts pass.

### Task 3: Implement responsive geometry

**Files:**
- Modify: `apps/web/src/features/community/community.css`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: new wrapper and toggle classes.
- Produces: non-growing reaction badges, safe palette position, compact pins, and hidden learning scrollbar.

- [ ] Anchor incoming reactions to the lower right and outgoing reactions to the lower left without changing bubble height.
- [ ] Use compact reaction visuals with an expanded touch target.
- [ ] Keep the teleported palette above the composer and above page headers.
- [ ] Style collapsed and expanded pinned states.
- [ ] Hide learning task body scrollbar in Firefox and WebKit while retaining overflow scrolling.
- [ ] Run focused tests and confirm all pass.

### Task 4: Release and verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: release 5.31 and a new service-worker cache generation.

- [ ] Add failing release assertions for version 5.31, release title, and the next cache name.
- [ ] Update release metadata and cache version.
- [ ] Run focused tests, full `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] Visually audit the module editor and chat states at all required viewports.
- [ ] Merge to main, push, wait for deployment, and verify production HTML, API health, cache, assets, version, and server commit.
