# Unified Headers and Compact Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize primary header spacing and replace oversized module cards with compact mobile-first rows.

**Architecture:** Add final foundation overrides for primary route headers so legacy rules cannot change their geometry. Keep the existing LearningSection data and actions, adding semantic layout classes that distinguish member summary actions from administrator controls.

**Tech Stack:** Vue 3, TypeScript, CSS design tokens, Vitest, Vite.

## Global Constraints

- Preserve API calls, routes, module ordering, lesson behavior, roles, and permissions.
- Keep every interactive target at least 44 × 44px.
- Use existing theme variables; do not add hard-coded theme colors.
- Use content-driven card heights and prevent horizontal overflow from 320px.

---

### Task 1: Header foundation and compact module rows

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/learning/learningArchive.test.ts`
- Test: `apps/web/src/features/app/uiFoundation.test.ts`

**Interfaces:**
- Consumes: existing `.section-head`, `.ui-page-header`, module actions, and theme tokens.
- Produces: `.module-card-summary`, `.module-member-actions`, and `.module-admin-actions` layout hooks.

- [ ] Add failing assertions for 16px primary-header padding, 12px header-to-content spacing, compact module rows, and a separate administrator action row.
- [ ] Run the focused tests and confirm the new assertions fail.
- [ ] Add semantic module layout classes and final token-based CSS overrides.
- [ ] Run focused tests and confirm they pass.

### Task 2: Release and deployment verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: current app version and service-worker cache naming.
- Produces: the next visible app version and cache revision.

- [ ] Increment the app version and service-worker cache revision with release notes.
- [ ] Run focused tests, `pnpm --filter @club/web build`, and `git diff --check`.
- [ ] Commit, push, rebuild the web container, and verify health, version, and cache from production.
