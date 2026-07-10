# Responsive Modal System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce three responsive modal sizes, readable mobile tariff cards, and a calmer compact light-theme admin UI without changing application behavior.

**Architecture:** Keep existing Vue components and modal backdrops. Replace the final universal CSS guard with shared width/containment rules plus explicit compact, form, and workspace selector groups. Add only the structural wrapper needed by the mailing composer so its header, body, and footer can behave independently.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Testing Library, Vite, Playwright.

## Global Constraints

- Preserve API, state, routes, authentication, and business logic.
- Keep mobile touch targets at least 44px.
- Keep safe-area offsets and gesture-lock behavior.
- Do not restore horizontal scrolling or pinch-driven modal layout movement.
- Support light and dark themes.

---

### Task 1: Modal size regression contract

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing modal class names and `body.club-mobile-device` shell marker.
- Produces: final CSS groups for compact, form, and workspace modal sizing.

- [ ] Add a failing CSS regression test that rejects a universal `height: var(--club-mobile-modal-height)` rule and requires the three selector groups.
- [ ] Run `pnpm --filter @club/web test -- App.test.ts` and confirm the new test fails on the current universal rule.
- [ ] Replace the final modal guard with shared width/containment styles and per-type height rules.
- [ ] Re-run the targeted test and confirm it passes.

### Task 2: Mobile tariff layout

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `.payment-product-list`, `.soft-payment-card`, `.payment-product-actions`.
- Produces: one readable tariff card per mobile row with a full-width action area.

- [ ] Change the mobile tariff test to require one-column cards and prevent the two-column compact card layout.
- [ ] Run the targeted test and confirm it fails.
- [ ] Add final mobile payment rules with one-column cards, readable copy, and stable owner controls.
- [ ] Re-run the targeted test and confirm it passes.

### Task 3: Mailing and module dialog structure

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/admin/adminMailings.test.ts`
- Modify: `apps/web/src/features/learning/learningArchive.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing submit, reset, close, save, and delete handlers.
- Produces: fixed modal header/footer regions and scrollable modal body regions.

- [ ] Add failing source/DOM tests for mailing body/footer wrappers and module action footer placement.
- [ ] Run the targeted feature tests and confirm the new assertions fail.
- [ ] Add semantic wrappers without changing handlers or data flow.
- [ ] Style the mailing form and module editor according to their modal type.
- [ ] Re-run feature tests and confirm they pass.

### Task 4: Light theme and compact admin hierarchy

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing light-theme variables and mobile admin class names.
- Produces: lower-elevation light surfaces and tighter mobile admin spacing.

- [ ] Add failing assertions for the final light-theme shadow tokens and compact admin spacing.
- [ ] Run the targeted test and confirm it fails.
- [ ] Add final theme token overrides and mobile admin spacing rules.
- [ ] Re-run the targeted test and confirm it passes.

### Task 5: Verification and deployment

**Files:**
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: current service-worker cache version.
- Produces: a fresh production shell that cannot reuse the old modal CSS.

- [ ] Bump the service-worker cache name and update its test.
- [ ] Run `pnpm --filter @club/web test`.
- [ ] Run `pnpm --filter @club/web build`.
- [ ] Run Playwright mobile and desktop checks.
- [ ] Verify screenshots at 360x800, 390x844, and 430x932 in light and dark themes.
- [ ] Commit, push `main`, deploy with the production update script, and verify `/api/health`, PostgreSQL health, server commit, and live cache version.
