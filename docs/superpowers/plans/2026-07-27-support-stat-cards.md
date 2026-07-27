# Support Stat Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually separate the four administrative support metrics into independent compact cards.

**Architecture:** Keep the existing semantic articles and computed data, but remove the shared card treatment from their grid container. Give each metric its own theme-aware surface, border, radius and shadow, with a 2×2 mobile grid and a 4×1 layout from 620 px.

**Tech Stack:** Vue 3 scoped CSS, Vitest source-style regression tests.

## Global Constraints

- Do not change ticket statistics, localization, API data or customer request cards.
- Use existing semantic theme variables.
- Keep the block compact and free of horizontal overflow from 320 px.

---

### Task 1: Independent support statistic cards

**Files:**
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/support/supportSection.test.ts`

**Interfaces:**
- Consumes: existing `ticketStats` and `averageResponseTimeLabel` values.
- Produces: transparent `.support-admin-stats` grid and four independent `.support-stat` cards.

- [ ] **Step 1: Add failing style behavior assertions** for an 8 px gap, transparent borderless container, card border/background/radius/shadow, 2×2 mobile columns and 4×1 columns at 620 px.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- src/features/support/supportSection.test.ts` and confirm the new assertions fail.
- [ ] **Step 3: Remove shared surface classes from the stats container and implement the independent card styles and breakpoint.**
- [ ] **Step 4: Run the focused support test** and confirm it passes.
- [ ] **Step 5: Commit** the support layout and regression test.

### Task 2: Integrate with release verification

**Files:**
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Produces: one release note shared with the Lava change describing the support-stat visual separation.

- [ ] **Step 1: Include the support-stat change in the next release-note failing test created by the Lava release task.**
- [ ] **Step 2: Add the support-stat item to the same release entry.**
- [ ] **Step 3: Run the support test, full typecheck, full test suite and production build before deployment.**
- [ ] **Step 4: Verify the production support page at 320, 390, 768 and 1024 px.**
