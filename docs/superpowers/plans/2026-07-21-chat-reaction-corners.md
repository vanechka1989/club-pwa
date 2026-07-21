# Chat Reaction Corners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every applied chat reaction as a non-growing circle on the message bubble's lower-right corner.

**Architecture:** Keep the existing Vue structure and reaction handlers. Change only the CSS geometry and its regression contract so `.message-reactions` stays absolute and every `.message-reaction-button` has fixed circular dimensions with a separate expanded touch area.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite, pnpm.

## Global Constraints

- Do not change reaction persistence or backend contracts.
- Use the lower-right corner for both incoming and outgoing messages.
- Keep every visual reaction circle exactly 32 × 32 px.
- Preserve a touch target of at least 44 × 44 px.
- Support 320, 390, 768, 1024, and 1440 px widths.

---

### Task 1: Lock the corner-circle geometry

**Files:**
- Modify: `apps/web/src/features/community/communityMediaUi.test.ts`
- Modify: `apps/web/src/features/community/community.css`

**Interfaces:**
- Consumes: existing `.message-reactions` and `.message-reaction-button` markup.
- Produces: a lower-right absolute anchor and fixed circular controls.

- [ ] Change the regression test to require `right: -8px` for both ownership states and reject the outgoing left anchor.
- [ ] Require fixed 32 px width, minimum width, height, minimum height, maximum height, zero padding, and `border-radius: 50%`.
- [ ] Run `pnpm --filter @club/web test -- communityMediaUi.test.ts` and confirm the test fails on the current left anchor and pill sizing.
- [ ] Update `community.css` with the minimum geometry needed to satisfy the contract.
- [ ] Run the focused test again and confirm it passes.

### Task 2: Release and verify

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: the next PWA version and service-worker cache generation.

- [ ] Add failing release assertions for the next version and cache name.
- [ ] Update Russian and English release notes, version metadata, and the service-worker cache.
- [ ] Run focused release tests, then `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] Verify the chat fixture at 320 × 720, 390 × 844, 768 × 1024, 1024 × 768, and 1440 × 900.
- [ ] Fast-forward main, push, wait for deployment success, and verify production health, assets, version, cache, and server commit.
