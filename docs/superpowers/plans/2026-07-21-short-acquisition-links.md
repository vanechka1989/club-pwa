# Short Advertising Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional readable `/go/:slug` links while keeping full tracked URLs available.

**Architecture:** Reuse `acquisition_links.aid` as the unique slug. Add a public API redirect endpoint and proxy it at the web root; derive both URLs in analytics responses.

**Tech Stack:** TypeScript, Hono, Drizzle, Vue 3, Nginx, Vitest.

## Global Constraints

- Existing full links must continue to work.
- Short and full links must produce identical attribution.
- No database migration.

---

### Task 1: URL contracts and redirect

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/acquisition/acquisitionAnalytics.ts`
- Modify: `apps/api/src/acquisition/acquisitionStore.ts`
- Modify: `apps/api/src/routes/acquisition.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/web/nginx.conf`
- Test: `packages/shared/src/acquisitionAnalytics.test.ts`
- Test: `apps/api/src/acquisition/acquisitionAnalytics.test.ts`
- Test: `apps/api/src/acquisition/acquisitionRoute.test.ts`

- [ ] Add failing tests for optional slug, `shortUrl`, conditional UTM redirect and 404 behavior.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement slug selection, short URL serialization and redirect endpoint.
- [ ] Add `/go/` proxy and run focused tests to green.

### Task 2: Admin interface

**Files:**
- Modify: `apps/web/src/features/admin/AdminAcquisitionAnalytics.vue`
- Test: `apps/web/src/features/admin/adminAcquisitionAnalytics.test.ts`

- [ ] Add failing assertions for optional short address and both copy actions.
- [ ] Add the slug input and separate short/direct URL buttons.
- [ ] Run web tests, type checks and production build.
- [ ] Commit, push, deploy and verify both URL variants.
