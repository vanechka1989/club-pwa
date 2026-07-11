# Device Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the notification screen reflect and toggle the real Web Push subscription of the current device, and apply the selected compact notification-list design.

**Architecture:** Pinia reads `PushManager.getSubscription()` as the local source of truth. Enable and disable operations synchronize one endpoint with the existing push API, with server revocation scoped to the authenticated user. The current TaskScreen remains and receives compact state-aware actions and cards.

**Tech Stack:** Vue 3, Pinia, Service Worker Push API, Hono, Drizzle ORM, Lucide, Vitest, Playwright.

## Global Constraints

- Toggle only the current device; never revoke another device's endpoint.
- Keep 44×44 px tap targets, all four semantic themes and the existing compact header.
- Use `Trash2` for clear history, `BellPlus` for enable and `BellOff` for disable.
- After disable show: «Push отключены. Оповещения больше не будут приходить на это устройство».
- Preserve notification data, routes, mailing logic and service-worker behavior.

---

### Task 1: User-scoped push revocation contract

**Files:**
- Modify: `apps/api/src/routes/push.ts`
- Create: `apps/api/src/push/pushRoutes.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `deleteWebPushSubscription(subscription: PushSubscriptionJSON): Promise<{ok:boolean}>`.

- [ ] **Step 1: Write failing API tests** proving DELETE updates only where both endpoint and `c.get("userId")` match, and another user's endpoint is untouched.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/api test -- pushRoutes.test.ts`.
- [ ] **Step 3: Change the DELETE predicate** to `and(eq(pushSubscriptions.endpoint, subscription.endpoint), eq(pushSubscriptions.userId, c.get("userId")))`.
- [ ] **Step 4: Add the typed client function** calling `DELETE /push/subscriptions` with the subscription JSON.
- [ ] **Step 5: Run GREEN** and API/web checks.
- [ ] **Step 6: Commit** `fix(push): scope subscription revocation to current user`.

### Task 2: Real browser push-state store

**Files:**
- Modify: `apps/web/src/stores/notifications.ts`
- Create: `apps/web/src/stores/notificationsPush.test.ts`

**Interfaces:**
- Produces: `PushStatus = "idle" | "checking" | "unsupported" | "denied" | "disabled" | "enabling" | "enabled" | "disabling" | "error"`; `refreshBrowserPushStatus()`, `enableBrowserPush()`, `disableBrowserPush()`.

- [ ] **Step 1: Write failing tests** with real-shaped browser fakes for no subscription→disabled, subscription→enabled, denied permission, successful enable, and disable calling API then `unsubscribe()`.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/web test -- notificationsPush.test.ts`.
- [ ] **Step 3: Extract support/registration lookup**, implement `refreshBrowserPushStatus()` from `getSubscription()`, and call it after operations.
- [ ] **Step 4: Enable flow** sets `enabling`, requests permission only when needed, subscribes/saves, refreshes, and emits the device-specific success toast.
- [ ] **Step 5: Disable flow** sets `disabling`, returns disabled when no local subscription, otherwise revokes the authenticated server record, calls `unsubscribe()`, verifies no subscription remains, and emits the exact warning toast.
- [ ] **Step 6: On errors**, refresh local state where possible, set `error` only when state cannot be established, and show a retryable error.
- [ ] **Step 7: Run GREEN** and existing notification/PWA tests.
- [ ] **Step 8: Commit** `feat(web): toggle real push state per device`.

### Task 3: Compact state-aware notification screen

**Files:**
- Modify: `apps/web/src/features/app/NotificationCenterScreen.vue`
- Modify: `apps/web/src/features/ui/foundation.css`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/notifications.test.ts`

**Interfaces:**
- Consumes: new store methods/status.

- [ ] **Step 1: Write failing component/source tests** for `onMounted(refreshBrowserPushStatus)`, exact enable/disable labels, BellPlus/BellOff icons, busy disabled state, and Trash2 clear control.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/web test -- notifications.test.ts`.
- [ ] **Step 3: Replace one-way enable handler** with a state-aware toggle; keep clear as a separate aria-labelled `Trash2` icon button.
- [ ] **Step 4: Apply variant A cards**: 36px status tile, compact padding, unread accent border plus icon, resilient title/date row, auto-height body and long-text wrapping.
- [ ] **Step 5: Keep actions in the compact second header row**, stack them only below 359px, and retain 44px interaction boxes.
- [ ] **Step 6: Run GREEN** and web build.
- [ ] **Step 7: Commit** `feat(web): polish compact notification center`.

### Task 4: Visual, theme and device verification

**Files:**
- Modify: `tests/e2e/app.spec.ts`

- [ ] **Step 1: Add a regression scenario** for enabled and disabled labels, no horizontal overflow, 44px controls, and compact header/card bounds.
- [ ] **Step 2: Run at 320×640, 390×844 and 768×1024**, capturing light/dark screenshots for both theme families.
- [ ] **Step 3: Verify PWA reload** preserves the label by re-reading the browser subscription rather than Pinia memory.
- [ ] **Step 4: Verify disable affects only the current endpoint** and displays the exact warning toast.
- [ ] **Step 5: Run targeted unit tests, web build and `git diff --check`; commit** `test(web): cover device push notification UI`.

### Task 5: Version and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] **Step 1: Update the failing cache/version assertion** to the next generation and verify RED.
- [ ] **Step 2: Update app version, timestamp, release note and service-worker cache; verify GREEN.**
- [ ] **Step 3: Run the targeted push/notification tests, web build and production asset check.**
- [ ] **Step 4: Deploy and verify production HEAD, version, cache name, assets and `/health`; commit** `release: ship device push controls`.
