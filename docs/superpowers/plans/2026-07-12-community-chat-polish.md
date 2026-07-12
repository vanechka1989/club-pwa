# Community Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make community image viewing, voice playback, composer spacing, and moderator menu reliable and compact on mobile.

**Architecture:** Keep the existing API and message contracts. Replace browser-native media presentation with focused Vue components: a gesture-driven image viewport and a controlled audio player, while tightening only community-chat CSS.

**Tech Stack:** Vue 3, TypeScript, Lucide icons, Vitest, CSS touch/pointer events.

## Global Constraints

- Preserve existing community API and retention behavior.
- Minimum interactive target is 44 × 44 CSS pixels.
- Support mobile widths from 320 px and safe-area insets.
- Do not add a third-party media dependency.

---

### Task 1: Gesture image viewer

**Files:**
- Create: `apps/web/src/features/community/useImageViewerGestures.ts`
- Modify: `apps/web/src/features/community/ChatImageGallery.vue`
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- Produces: `useImageViewerGestures()` with scale, translation, pointer handlers, reset, and double-tap zoom.

- [ ] Write tests asserting pinch, pan, double-tap, and transform bindings.
- [ ] Run the focused test and confirm it fails because gesture support is absent.
- [ ] Implement bounded scale 1–4, pan only while zoomed, reset on image navigation, and `touch-action: none`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Controlled voice player

**Files:**
- Modify: `apps/web/src/features/community/ChatVoiceMessage.vue`
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- Consumes: existing `ClubMessage.voice.url` and `durationSeconds`.
- Produces: play/pause button, seek range, elapsed/total label, loading and playback-error states.

- [ ] Write tests asserting custom controls, metadata/error handling, and no native `controls` attribute.
- [ ] Run the focused test and confirm it fails on the current native player.
- [ ] Implement a hidden audio element controlled by Vue state, with server duration fallback before metadata loads.
- [ ] Run the focused test and confirm it passes.

### Task 3: Compact composer and bounded moderator menu

**Files:**
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- Replaces the plus icon with Lucide `Paperclip` while preserving the attachments menu.
- Keeps controls in the order attachment, emoji, expanding input, microphone, send.

- [ ] Write tests asserting the paperclip icon and CSS rules for 4 px gaps, flexible input, and wrapped in-viewport admin menu.
- [ ] Run the focused test and confirm it fails.
- [ ] Update the template and scoped community CSS without changing submit behavior.
- [ ] Run the focused test and confirm it passes.

### Task 4: Verification and release

**Files:**
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: application version and service-worker cache version files discovered in the repository.

- [ ] Run the focused community tests.
- [ ] Run the full test, type-check, and production build commands.
- [ ] Visually inspect 320 px, 390 px, and landscape mobile chat states.
- [ ] Increment the visible application version and service-worker cache.
- [ ] Commit, push `main`, wait for the VPS workflow, and verify production health.
