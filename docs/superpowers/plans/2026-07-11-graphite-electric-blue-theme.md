# Graphite + Electric Blue Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Graphite + Electric Blue as a second design theme while preserving Dark Soft Touch and keeping light/dark mode independent.

**Architecture:** Keep the existing `theme` state and `data-theme` attribute as the light/dark mode contract. Add a separate `designTheme` state, persisted under `club-design-theme`, and expose it through `data-design-theme`; Graphite overrides only semantic design tokens and theme-specific shared component treatments.

**Tech Stack:** Vue 3, Pinia, TypeScript, CSS custom properties, Vitest, Playwright.

## Global Constraints

- Do not change the existing Dark Soft Touch palette or behavior.
- Support exactly two design themes: `dark-soft-touch` and `graphite-electric-blue`.
- Support `light` and `dark` independently for both design themes.
- Preserve API, routing, state, authentication, and business logic.
- Persist both selected values across reloads.

---

### Task 1: Independent theme state

**Files:**
- Modify: `apps/web/src/stores/ui.ts`
- Test: `apps/web/src/stores/ui.test.ts`

**Interfaces:**
- Produces: `DesignTheme`, `designTheme`, `setDesignTheme(nextTheme)`.

- [ ] Add failing store tests for defaults, persistence, independent mode changes, and legacy migration.
- [ ] Run `pnpm --filter @club/web test -- src/stores/ui.test.ts` and verify the new tests fail.
- [ ] Implement the minimal Pinia state and HTML attribute synchronization.
- [ ] Re-run the store tests and verify they pass.

### Task 2: Appearance settings UI

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.ts`

**Interfaces:**
- Consumes: `DesignTheme`, `ui.designTheme`, `ui.setDesignTheme`.

- [ ] Add failing source/CSS tests for the separate Themes block and two selectable cards.
- [ ] Run the focused tests and verify they fail for the missing theme UI.
- [ ] Add the translated labels, theme preview cards, selected state, focus state, and responsive layout.
- [ ] Re-run focused tests and verify they pass.

### Task 3: Graphite token layer and cross-screen verification

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/designSystem.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `data-design-theme` plus the existing `data-theme` mode.

- [ ] Add failing tests for the exact Graphite day/night token values and four combinations.
- [ ] Run focused tests and verify the missing Graphite selectors fail.
- [ ] Add the Graphite semantic token maps and shared blue active-state overrides without touching Dark Soft Touch selectors.
- [ ] Verify `pnpm --filter @club/web test`, `pnpm --filter @club/web check`, `pnpm --filter @club/web build`, and targeted Playwright mobile/desktop checks.
