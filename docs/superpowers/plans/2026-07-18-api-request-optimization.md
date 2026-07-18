# API Request Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce synchronous API fan-out and database work for 100 concurrently active PWA clients without changing existing screen behavior.

**Architecture:** Add one lightweight authenticated application-state endpoint for background polling and keep full `/me`, `/notifications`, `/support`, and `/community/topics` responses for screen entry only. Move unread and topic aggregate work into grouped SQL, deduplicate client refreshes, and validate the result with the existing 100-client production load scenario.

**Tech Stack:** Vue 3, TypeScript, Pinia, Hono, Drizzle ORM, PostgreSQL, Vitest, k6-compatible Bun load scripts.

## Global Constraints

- Keep existing public screen API contracts backward compatible.
- Do not add Redis or another runtime dependency on the current 2 vCPU / 2 GB tariff.
- Preserve 30-second visibility-aware polling and SSE delivery.
- Use test-first red-green cycles for every behavior change.
- Bump the visible application version and deploy only after full verification.

---

### Task 1: Lightweight application-state API

**Files:**
- Create: `apps/api/src/appState/query.ts`
- Create: `apps/api/src/appState/query.test.ts`
- Create: `apps/api/src/routes/appState.ts`
- Create: `apps/api/src/routes/appState.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `GET /app-state` returning membership/access fields, `notificationUnreadCount`, and `supportUnreadCount`.
- Consumes: authenticated `currentUser` from `sessionAuth` so no duplicate user lookup is performed.

- [ ] Write failing API contract and query-shape tests.
- [ ] Run the focused API tests and verify the missing endpoint/query failures.
- [ ] Implement grouped/count queries and mount the route.
- [ ] Run the focused tests and verify they pass.

### Task 2: Efficient unread and topic queries

**Files:**
- Modify: `apps/api/src/routes/support.ts`
- Modify: `apps/api/src/routes/community.ts`
- Create: `apps/api/src/support/unreadCount.test.ts`
- Create: `apps/api/src/community/topicListQuery.test.ts`

**Interfaces:**
- Produces: SQL-side support unread count without loading all tickets.
- Produces: topic serialization using grouped message counts and latest-reply aggregates instead of two queries per topic.

- [ ] Write failing source/query tests that reject in-memory ticket filtering and per-topic query loops.
- [ ] Run focused tests and verify the expected failures.
- [ ] Replace the implementations with SQL aggregates while preserving response types.
- [ ] Run focused tests and verify they pass.

### Task 3: Consolidated client polling

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/stores/notifications.ts`
- Modify: `apps/web/src/App.test.ts`
- Create: `apps/web/src/appStatePolling.test.ts`

**Interfaces:**
- Consumes: `getAppState(): Promise<AppStateResponse>`.
- Produces: one visibility-aware background request with in-flight deduplication and updates to the session access state and badge counters.

- [ ] Write failing tests asserting one polling timer/request and no full notification-list polling in the background.
- [ ] Run focused web tests and verify the old fan-out fails them.
- [ ] Implement consolidated polling and keep full notification loading on the notification screen.
- [ ] Run focused web tests and verify they pass.

### Task 4: Verification, version, deployment, and repeated load test

**Files:**
- Modify: application version source located by repository search.
- Create: `docs/load-reports/2026-07-18-api-optimized-100-production.md`

**Interfaces:**
- Consumes: the existing production 100-client load harness.
- Produces: before/after p50, p95, p99, maximum latency, error count, memory, restart, and PostgreSQL connection comparison.

- [ ] Run all package tests, checks, and builds.
- [ ] Bump and verify the visible application version.
- [ ] Deploy with the repository production deployment workflow.
- [ ] Run production health/readiness checks.
- [ ] Repeat the same 100-client API/realtime load scenario and record the comparison.
- [ ] Commit the implementation and report with exact verification evidence.
