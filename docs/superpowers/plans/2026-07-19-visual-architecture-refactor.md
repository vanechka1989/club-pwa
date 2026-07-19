# Visual Architecture Refactor Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish and enforce one visual contract for the PWA's main pages without changing their behavior.

**Architecture:** Extend the existing `features/ui/foundation.css` token layer, reuse `UiPageHeader` in all main feature sections, and protect the result with source-level architecture tests and CSS debt budgets.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, CSS custom properties.

---

### Task 1: Add visual architecture tests

**Files:**
- Create: `apps/web/src/features/app/visualArchitecture.test.ts`

1. Assert that every main section imports and renders `UiPageHeader`.
2. Assert that duplicated `section-head ui-page-header` markup is absent from those sections.
3. Assert that semantic typography tokens and role utilities exist in `foundation.css`.
4. Add explicit debt budgets for `!important` and tiny raw font sizes in touched stylesheets.
5. Run the test and confirm it fails against the current implementation.

### Task 2: Introduce semantic typography roles

**Files:**
- Modify: `apps/web/src/features/ui/foundation.css`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/community/community.css`

1. Add role-based typography custom properties.
2. Add reusable role classes and map legacy headings/text to the same properties.
3. Replace selected raw 10–12px metadata sizes with semantic role tokens.
4. Remove feature-level `!important` declarations that are redundant under current stylesheet order.
5. Run the architecture test and adjust only the intended visual rules.

### Task 3: Migrate main page headers

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`

1. Import `UiPageHeader` from the shared UI package.
2. Replace duplicated page-header wrappers with the component.
3. Preserve existing action controls through the `actions` slot.
4. Preserve translations, permissions, version data, and click handlers.
5. Run focused header/design-system tests.

### Task 4: Verify the full client

**Files:**
- Verify only.

1. Run visual architecture, header consistency, and design-system tests.
2. Run the web TypeScript check.
3. Run the complete web unit suite.
4. Run the production web build.
5. Inspect the diff for unintended behavior or theme changes.
