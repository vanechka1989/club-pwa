# Remove Duplicate Acquisition Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the repeated acquisition summary while keeping the KPI cards and interactive timeline.

**Architecture:** Change only the acquisition dashboard presentation. Remove the redundant computed view model, template section, and unused CSS while preserving all API data and drilldown behavior.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite.

## Global Constraints

- Preserve API contracts and analytics calculations.
- Keep the existing responsive KPI grid and timeline.
- Publish the change as the next application version.

---

### Task 1: Remove the repeated summary

**Files:**
- Modify: `apps/web/src/features/admin/AdminAcquisitionAnalytics.vue`
- Test: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: `AdminAcquisitionDashboard.summary` already rendered by the KPI cards.
- Produces: one summary followed directly by the existing timeline.

- [ ] Write a test that rejects the duplicate title and funnel CSS classes.
- [ ] Run the focused test and confirm it fails on the current duplicate block.
- [ ] Remove the duplicate computed model, markup, and styles.
- [ ] Update the application version and release note.
- [ ] Run focused tests, full tests, type checks, and production build.
- [ ] Deploy and verify production health and assets.
