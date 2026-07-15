# Community Voice Waveform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one compact live waveform experience for recording, previewing, sending, playing, and seeking community voice messages.

**Architecture:** Add focused waveform math and a reusable Vue waveform control. Extend the existing recorder with microphone levels, replace the draft native player, and reuse the waveform control in sent messages without changing API or storage contracts.

**Tech Stack:** Vue 3, TypeScript, Web Audio API, MediaRecorder, Vitest, Vue Test Utils, Playwright.

## Global Constraints

- Keep the current voice upload API and five-minute recording limit.
- Preserve the recorded blob after upload errors.
- Use semantic theme variables and 44 × 44 px tap targets.
- Prevent horizontal overflow at 320 px.
- Keep Russian and English interface copy complete.

---

### Task 1: Waveform model

**Files:**
- Create: `apps/web/src/features/community/voiceWaveform.ts`
- Create: `apps/web/src/features/community/voiceWaveform.test.ts`

**Interfaces:**
- Produces: `normalizeVoiceLevel(value: number): number`, `appendVoiceLevel(levels: number[], value: number, limit?: number): number[]`, `voiceProgress(currentTime: number, duration: number): number`.

- [ ] Write failing tests for clamping levels, limiting the rolling buffer, and progress between 0 and 1.
- [ ] Run `pnpm --filter @club/web test -- voiceWaveform.test.ts` and confirm the missing module failure.
- [ ] Implement the three pure functions with finite-number guards.
- [ ] Run the focused test and confirm it passes.

### Task 2: Reusable waveform control

**Files:**
- Create: `apps/web/src/features/community/ChatVoiceWaveform.vue`
- Create: `apps/web/src/features/community/ChatVoiceWaveform.test.ts`
- Modify: `apps/web/src/features/community/community.css`

**Interfaces:**
- Consumes: normalized `levels`, `currentTime`, `duration`, and `interactive` props.
- Produces: `seek` event with the selected time in seconds.

- [ ] Write failing component tests for rendered bars, played-state bars, accessible range input, and emitted seek time.
- [ ] Run the focused component test and confirm failure because the component is absent.
- [ ] Implement bars with progress coloring and a transparent range input over the waveform.
- [ ] Add compact semantic styles with no overflow at 320 px.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Live recording levels and compact draft

**Files:**
- Modify: `apps/web/src/features/community/useVoiceRecorder.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Modify: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- `useVoiceRecorder()` additionally returns `levels: Ref<number[]>`.
- Recording panel passes `levels` to `ChatVoiceWaveform`; preview panel controls its hidden audio element and emits seek updates.

- [ ] Add failing tests asserting the analyser lifecycle and the compact icon-only draft states.
- [ ] Run focused tests and confirm expected failures.
- [ ] Connect `AudioContext`, `MediaStreamAudioSourceNode`, and `AnalyserNode`; sample RMS levels with `requestAnimationFrame`, and release all nodes on stop/cancel/dispose.
- [ ] Replace both existing draft blocks with one-row controls and a hidden audio element for preview.
- [ ] Keep upload loading and retry behavior unchanged.
- [ ] Run focused tests and confirm they pass.

### Task 4: Sent message waveform and seeking

**Files:**
- Modify: `apps/web/src/features/community/ChatVoiceMessage.vue`
- Modify: `apps/web/src/features/community/community.css`
- Modify: `apps/web/src/features/community/communityMediaUi.test.ts`

**Interfaces:**
- Sent messages reuse `ChatVoiceWaveform` and set `audio.currentTime` from its `seek` event.

- [ ] Add failing assertions that sent messages use the shared component and no longer contain duplicated fixed bars.
- [ ] Run the focused test and confirm failure.
- [ ] Replace the fixed bar markup with `ChatVoiceWaveform`, preserve stable URL refresh and retry behavior, and keep time updates synchronized.
- [ ] Run focused tests and confirm they pass.

### Task 5: Localization, version, visual verification, and release

**Files:**
- Modify: `apps/web/src/features/app/interfaceLocalization.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] Add failing expectations for new recording labels, the next app version, and the next service-worker cache.
- [ ] Implement translations and release metadata.
- [ ] Run community, localization, release-note, and PWA tests.
- [ ] Run `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] Run mobile visual checks at 320, 390, and 768 px and inspect recording, preview, loading, and sent-message states for overflow.
- [ ] Commit, push `main`, deploy with `deploy/update.sh`, then verify health, version, release title, service-worker cache, server commit, and clean local worktree.
