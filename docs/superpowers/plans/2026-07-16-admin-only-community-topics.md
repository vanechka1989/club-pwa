# Admin-only Community Topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add community topics that are visible and usable only by the owner and administrators with the community permission.

**Architecture:** Persist an `isAdminOnly` topic flag, centralize the role-based access decision in a pure helper, and apply it to list queries and every member-facing topic operation. Extend the existing compact create form and topic cards without introducing a second chat subsystem.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, Zod, Vue 3, Vitest, CSS.

## Global Constraints

- Existing topics remain public by default.
- Unauthorized topic access must return `404` and must not leak realtime topic identifiers.
- “Administrator” means owner or administrator with the existing `community` permission.
- New copy must exist in Russian and English.

---

### Task 1: Topic access contract and persistence

**Files:**
- Create: `apps/api/src/community/topicAccess.ts`
- Create: `apps/api/src/community/topicAccess.test.ts`
- Create: `apps/api/drizzle/0045_admin_only_community_topics.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/communityMessages.test.ts`

**Interfaces:**
- Produces: `isTopicAccessibleForRole(topic, role): boolean` and `ClubTopic.isAdminOnly: boolean`.

- [ ] Write tests proving public topics are available to every role and private topics only to `admin` and `owner`.
- [ ] Run the focused tests and confirm failure because the helper and field do not exist.
- [ ] Add the schema column, migration, shared field, and minimal helper.
- [ ] Run focused tests and confirm they pass.

### Task 2: API enforcement

**Files:**
- Modify: `apps/api/src/routes/community.ts`
- Create: `apps/api/src/community/adminOnlyTopicsRoute.test.ts`

**Interfaces:**
- Consumes: `isTopicAccessibleForRole`.
- Produces: topic creation payload `{ title, description?, isAdminOnly? }` and protected list/message/poll/reaction routes.

- [ ] Write route contract tests covering list filters, topic creation, direct message operations, polls, reactions, and realtime filtering.
- [ ] Run the focused tests and confirm they fail on missing enforcement.
- [ ] Add `isAdminOnly` to payload parsing and inserts.
- [ ] Add a centralized accessible-topic lookup and apply it to member-facing operations.
- [ ] Filter hidden-topic realtime events for members.
- [ ] Run API tests and confirm they pass.

### Task 3: Compact admin UI

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/community/community.css`
- Modify: `apps/web/src/features/app/i18n.ts`
- Create: `apps/web/src/features/community/adminOnlyTopicsUi.test.ts`

**Interfaces:**
- Consumes: `ClubTopic.isAdminOnly` and `createCommunityTopic({ isAdminOnly })`.
- Produces: compact visibility checkbox, list badge, and room subtitle.

- [ ] Write source/UI tests for the checkbox payload, reset behavior, lock badge, translated room subtitle, and 44 px control.
- [ ] Run the focused test and confirm failure.
- [ ] Implement the API type, reactive form field, template, i18n strings, and styles.
- [ ] Run web tests and confirm they pass.

### Task 4: Release verification and deployment

**Files:**
- Modify: application version and service-worker cache files used by the repository.
- Modify: release notes/changelog files used by the repository.

- [ ] Bump the application version and PWA cache exactly once.
- [ ] Run focused tests, full tests, type checks, and production build.
- [ ] Visually verify the create form and private badge on mobile and confirm no horizontal overflow.
- [ ] Commit, push `main`, wait for deployment, and verify production health, migration status, and version.

