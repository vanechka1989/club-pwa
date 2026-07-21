# Acquisition Links UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify source display and make advertising-link creation flexible, attributable, and newest-first.

**Architecture:** Preserve the database schema, relax the shared input contract to accept empty individual UTM strings with a cross-field minimum of one, and serialize the existing creator relation. Keep ordering explicit in the list API and presentation simple in Vue.

**Tech Stack:** Zod, Drizzle ORM, Vue 3, TypeScript, Vitest.

## Global Constraints

- Link name remains required.
- At least one UTM value is required.
- Empty UTM values must not be emitted into the URL.
- No database migration.

---

### Task 1: Contracts and server behavior

**Files:** `packages/shared/src/index.ts`, `packages/shared/src/acquisitionAnalytics.test.ts`, `apps/api/src/acquisition/acquisitionAnalytics.ts`, `apps/api/src/acquisition/acquisitionStore.ts`, `apps/api/src/acquisition/acquisitionAnalytics.test.ts`

- [ ] Add failing tests for one-of-four UTM validation, creator serialization, omitted empty query parameters, and newest-first sorting.
- [ ] Relax individual UTM fields and add a cross-field validation error when all are empty.
- [ ] Serialize creator identity from the existing `created_by_user_id` reference.
- [ ] Store empty UTM fields as empty strings and add only non-empty values to generated URLs.
- [ ] Sort the management list by `createdAt` descending.

### Task 2: Mobile interface

**Files:** `apps/web/src/features/admin/AdminClientAcquisition.vue`, `apps/web/src/features/admin/AdminAcquisitionAnalytics.vue`, `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`

- [ ] Add failing UI-source tests for header source placement, top entry placement, optional inputs, submit validation, author metadata, and newest-first insertion.
- [ ] Move the source value into the client-card header and remove the nested source article.
- [ ] Move the links entry above dashboard metrics.
- [ ] Make UTM inputs optional, disable submission until one is present, and show author/date on each card.
- [ ] Verify focused tests pass.

### Task 3: Release

**Files:** no additional source files.

- [ ] Run the full test suite, type checks, and production build.
- [ ] Inspect production at 320, 390, 768, 1024, and 1440 px without overflow.
- [ ] Commit, push `main`, deploy, and verify HTTP 200 with the deployed commit.
