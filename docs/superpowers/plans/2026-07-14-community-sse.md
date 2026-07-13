# Community Chat SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the community chat's two-second message polling with an authenticated SSE invalidation stream while preserving the existing HTTP write and message-loading APIs.

**Architecture:** The API owns a small in-memory event hub because production currently runs one API container. Every successful community mutation publishes a transport-neutral invalidation event; `/community/events` streams those events and periodic heartbeats to authenticated users with community access. The PWA keeps one `EventSource` while the community section is active, refreshes the selected chat only when an event arrives, and performs a sync after connection or reconnection.

**Tech Stack:** Bun, Hono, TypeScript, Vue 3, native `EventSource`, Vitest, pnpm.

## Global Constraints

- Do not add online presence or typing indicators.
- Keep message, voice, image, poll, reaction and moderation writes on the existing HTTP endpoints.
- Do not add Redis while production uses one API instance.
- Preserve cookie authentication and community access checks on the stream.
- Keep PWA push notifications for background or closed-app delivery.
- Bump the application version and add a Russian release note.

---

### Task 1: Server-side community event hub

**Files:**
- Create: `apps/api/src/community/realtime.ts`
- Create: `apps/api/src/community/realtime.test.ts`

**Interfaces:**
- Produces: `publishCommunityChange(topicId?: string | null): CommunityRealtimeEvent`
- Produces: `subscribeToCommunityChanges(listener): () => void`
- Produces: `getCommunityRealtimeSubscriberCount(): number`

- [ ] **Step 1: Write the failing hub tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getCommunityRealtimeSubscriberCount,
  publishCommunityChange,
  subscribeToCommunityChanges
} from "./realtime";

describe("community realtime hub", () => {
  it("publishes ordered invalidation events and removes subscribers", () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeToCommunityChanges((event) => events.push(event));
    const first = publishCommunityChange("topic-1");
    unsubscribe();
    publishCommunityChange("topic-2");
    expect(events).toEqual([first]);
    expect(first.topicId).toBe("topic-1");
    expect(getCommunityRealtimeSubscriberCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/api test -- src/community/realtime.test.ts`

Expected: FAIL because `./realtime` does not exist.

- [ ] **Step 3: Implement the minimal hub**

Create a typed listener set, a monotonically increasing event identifier, publish a `community.changed` event containing `topicId` and `createdAt`, and return an idempotent unsubscribe function.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @club/api test -- src/community/realtime.test.ts`

Expected: PASS with one test.

### Task 2: Authenticated SSE endpoint and mutation invalidation

**Files:**
- Modify: `apps/api/src/routes/community.ts`
- Create: `apps/api/src/community/realtimeRoute.test.ts`

**Interfaces:**
- Consumes: `publishCommunityChange` and `subscribeToCommunityChanges` from Task 1.
- Produces: `GET /community/events` with `text/event-stream`, `ready`, `community.changed`, and `heartbeat` events.

- [ ] **Step 1: Write the failing route wiring test**

The source-level regression test must assert that the route imports `streamSSE`, exposes `.get("/events"`, checks `ensureCommunityAccess`, subscribes with `subscribeToCommunityChanges`, writes `community.changed`, registers `stream.onAbort`, and publishes after successful non-GET community mutations.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/api test -- src/community/realtimeRoute.test.ts`

Expected: FAIL because the route has no SSE endpoint or invalidation middleware.

- [ ] **Step 3: Implement the SSE route and publisher middleware**

Add a post-response middleware after authentication that publishes only when the method is not `GET` and the response status is below 400. Add `/events` before parameterized topic routes, validate community access, set streaming headers, send an immediate `ready` event, forward hub events, send a heartbeat every 25 seconds, and always unsubscribe after abort or write failure.

- [ ] **Step 4: Run focused API tests**

Run: `pnpm --filter @club/api test -- src/community/realtime.test.ts src/community/realtimeRoute.test.ts`

Expected: PASS.

### Task 3: Native EventSource client and removal of message polling

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Create: `apps/web/src/features/community/communityRealtime.test.ts`

**Interfaces:**
- Produces: `createCommunityEventSource(): EventSource`
- Consumes: browser `community.changed`, `ready`, `open`, and `error` events.

- [ ] **Step 1: Write the failing PWA regression test**

The test must assert that the client constructs `${apiUrl}/community/events`, the component uses `createCommunityEventSource`, closes it on access loss and unmount, listens for `community.changed`, and no longer contains the 2000 ms message refresh interval.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- src/features/community/communityRealtime.test.ts`

Expected: FAIL because the EventSource helper and lifecycle are absent.

- [ ] **Step 3: Implement the client lifecycle**

Create a single EventSource when community access becomes available. Debounce invalidations briefly so simultaneous mutations cause one refresh. When a topic is open, call the existing `refreshSelectedTopic`; when the topic list is open, call `loadTopics`. Treat the first `ready` event after a connection as a synchronization trigger. Close and clear the stream on access loss and component unmount. Retain the existing five-second topic-list fallback only when SSE is disconnected; remove the two-second selected-message interval completely.

- [ ] **Step 4: Run focused web tests**

Run: `pnpm --filter @club/web test -- src/features/community/communityRealtime.test.ts src/features/community/communityMediaUi.test.ts`

Expected: PASS.

### Task 4: Version and release note

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`

**Interfaces:**
- Produces: application version `4.21` and a release-note entry describing real-time chat delivery.

- [ ] **Step 1: Update version metadata**

Set `appVersion` to `4.21`, set the Novosibirsk update timestamp for 14.07.2026, and replace the dynamic top release-note entry with a title and bullets explaining SSE delivery, automatic reconnection, and the removal of two-second message polling.

- [ ] **Step 2: Verify version tests and build inputs**

Run: `pnpm --filter @club/web test -- src/App.test.ts`

Expected: PASS.

### Task 5: Full verification and production deployment

**Files:**
- Verify only: all changed files and production deployment configuration.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: tested production deployment of version `4.21`.

- [ ] **Step 1: Run full automated verification**

Run: `pnpm test && pnpm check && pnpm build`

Expected: all commands exit with status 0.

- [ ] **Step 2: Review the final diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors and only SSE, tests, version, release-note and plan files changed.

- [ ] **Step 3: Commit and push the production branch**

Run: `git add <changed files> && git commit -m "feat: deliver community chat updates with SSE" && git push origin main`

Expected: the remote accepts the commit and the production deployment workflow starts.

- [ ] **Step 4: Verify production**

Check the public health endpoint and the authenticated community stream through the deployed domain, then confirm the production containers are healthy.

