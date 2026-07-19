# Bottom Navigation Switch Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the bottom-navigation-position switch colors with the interface-scale slider while preserving its stable geometry and behavior.

**Architecture:** Keep the existing semantic switch and 52 × 44 px touch target. Change only CSS color composition, using the same neutral border/track and theme accent tokens already used by the scale control.

**Tech Stack:** Vue 3, TypeScript, CSS semantic tokens, Vitest, Playwright.

## Global Constraints

- Preserve the 52 × 44 px touch target.
- Do not change persistence or bottom-navigation positioning behavior.
- Do not add iOS/Android platform branches.
- Preserve focus-visible and 160 ms transitions.

---

### Task 1: Align switch colors and release

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/pwa/pwa.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: semantic tokens `--border`, `--field`, `--accent`, and `--accent-soft`.
- Produces: unchanged `appearance-switch` DOM and behavior with scale-control-aligned colors.

- [ ] **Step 1: Write a failing regression test**

Assert that `.appearance-switch::before` uses the neutral slider-style border/track composition and checked state uses the accent tokens.

- [ ] **Step 2: Run the targeted unit test and verify RED**

Run: `pnpm --filter @club/web test -- App.test.ts`

Expected: FAIL because the current switch uses `var(--surface-3)` and `var(--border-strong)`.

- [ ] **Step 3: Implement the minimal CSS change**

Use `color-mix()` with `--field`, `--panel`, `--border`, and `--accent-soft`; keep all geometry unchanged.

- [ ] **Step 4: Run targeted tests and mobile browser checks**

Run the unit test and targeted Playwright checks at 320 px, Android, and iPhone viewports. Expected: PASS with a 52 × 44 px switch.

- [ ] **Step 5: Bump the release and verify the full project**

Update the application version and service-worker cache; run `pnpm test`, `pnpm check`, and `pnpm build`. Expected: exit code 0 for all commands.

- [ ] **Step 6: Commit, push, deploy, and verify production**

Commit the implementation, push `main`, wait for deployment workflows, then verify the production service worker and application version.
