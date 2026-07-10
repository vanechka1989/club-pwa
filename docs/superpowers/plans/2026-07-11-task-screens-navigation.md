# Task Screens Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace complex modal overlays with routed task screens while preserving the existing API, stores, permissions, and feature behavior.

**Architecture:** Install Vue Router as the single navigation history. Keep the current section components, but derive the active section from the route and let each feature render either its list screen or a routed task screen. Reuse one `TaskScreen` layout, one `BottomSheet`, and one `ConfirmDialog`; media viewers remain dedicated fullscreen viewers.

**Tech Stack:** Vue 3.5, Vue Router 4, Pinia, TypeScript, Vitest, Playwright, Vite.

## Global Constraints

- Preserve all API contracts, Pinia state, authorization, and business rules.
- Mobile task screens use normal document flow, one scrolling body, safe-area padding, and no modal height calculations.
- Mobile bottom navigation is hidden while `route.meta.task === true`; desktop sidebar remains visible.
- All touch targets remain at least 44 px.
- No horizontal scroll from 360 px through desktop widths.
- Keep only compact confirmations, bottom sheets, and media viewers as overlays.
- Every migration follows RED, GREEN, full regression verification, then commit.

---

### Task 1: Router and Task Surface Foundation

**Files:**
- Create: `apps/web/src/router.ts`
- Create: `apps/web/src/features/app/TaskScreen.vue`
- Create: `apps/web/src/features/app/BottomSheet.vue`
- Create: `apps/web/src/features/app/ConfirmDialog.vue`
- Create: `apps/web/src/features/app/taskNavigation.ts`
- Create: `apps/web/src/features/app/taskNavigation.test.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/features/app/navigation.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `router`, `sectionPath(section)`, `sectionFromPath(path)`, `isTaskRoute(route)`, `TaskScreen` slots `header/default/footer`.
- Consumes: existing `AppSection` and theme tokens.

- [ ] **Step 1: Write failing route and task-layout tests**

```ts
expect(sectionFromPath('/support/tickets/123')).toBe('support');
expect(sectionFromPath('/admin/mailings/new')).toBe('admin');
expect(taskRoutes.every((route) => route.meta?.task)).toBe(true);
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm --filter @club/web test -- features/app/taskNavigation.test.ts`
Expected: FAIL because router helpers do not exist.

- [ ] **Step 3: Add Vue Router and shared task primitives**

Run: `pnpm --filter @club/web add vue-router@^4.5.0`

Create route records for every path in the approved spec. `TaskScreen` renders a semantic `<section class="task-screen">` with sticky header, scroll body, optional footer, and emits `back`.

- [ ] **Step 4: Add shared CSS**

```css
.task-screen { min-height: var(--app-viewport-height); width: 100%; }
.task-screen-body { min-height: 0; overflow-y: auto; }
.task-screen-footer { position: sticky; bottom: 0; padding-bottom: max(.75rem, var(--club-safe-bottom)); }
```

- [ ] **Step 5: Run GREEN tests and build**

Run: `pnpm --filter @club/web test -- features/app/taskNavigation.test.ts && pnpm --filter @club/web build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/router.ts apps/web/src/features/app apps/web/src/main.ts apps/web/src/styles.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add routed task screen foundation"
```

### Task 2: Route-Aware App Shell

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/features/app/navigation.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `sectionFromPath`, `sectionPath`, Vue Router `useRoute/useRouter`.
- Produces: route-driven top-level sections and task-aware mobile navigation.

- [ ] **Step 1: Add failing tests**

```ts
expect(appSource).toContain('const route = useRoute()');
expect(appSource).toContain('const activeSection = computed');
expect(appSource).toContain('!isTaskRoute(route)');
```

- [ ] **Step 2: Run RED test**

Run: `pnpm --filter @club/web test -- App.test.ts`
Expected: FAIL on route-aware assertions.

- [ ] **Step 3: Replace local section state with route state**

`selectSection(section)` pushes `sectionPath(section)`. Route metadata controls whether bottom navigation is visible. Existing preview-mode and support-to-client transitions push their routed destinations instead of setting temporary cross-feature IDs.

- [ ] **Step 4: Add session and role guards**

Unauthenticated routes retain their target URL while login is shown. Admin task routes redirect non-admin users to `/profile`. Member-only routes redirect inactive members to `/profile` with the existing access message.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @club/web test -- App.test.ts features/app/taskNavigation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.vue apps/web/src/App.test.ts apps/web/src/features/app/navigation.ts tests/e2e/app.spec.ts
git commit -m "feat: drive app sections from routes"
```

### Task 3: Support and Notifications Task Screens

**Files:**
- Create: `apps/web/src/features/support/SupportTicketScreen.vue`
- Create: `apps/web/src/features/support/SupportCreateScreen.vue`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/support/supportSection.test.ts`
- Modify: `apps/web/src/features/app/NotificationCenter.vue`
- Modify: `apps/web/src/features/app/notifications.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Routes: `/support/new`, `/support/tickets/:ticketId`, `/notifications`.
- Reuses: current support API methods and notification store actions.

- [ ] **Step 1: Add failing source and Playwright tests**

Tests assert no `support-modal-backdrop` around ticket forms, route URLs change, Back returns to `/support`, keyboard leaves the reply field and submit button visible, and notifications render without a backdrop.

- [ ] **Step 2: Run RED tests**

Run: `pnpm --filter @club/web test -- features/support/supportSection.test.ts features/app/notifications.test.ts`
Expected: FAIL on task-screen assertions.

- [ ] **Step 3: Extract support screens and route loading**

Move create and thread markup into the new components. Route params select/load the ticket. Keep support close confirmation in `ConfirmDialog`. Keep attachment preview as `MediaViewer` behavior.

- [ ] **Step 4: Convert notification center**

The bell pushes `/notifications`; Back returns to the previous route. Preserve clear, push-enable, read-state, and unread badge behavior.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @club/web test -- features/support/supportSection.test.ts features/app/notifications.test.ts && .\\node_modules\\.bin\\playwright.cmd test --grep "support|notification"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/support apps/web/src/features/app/NotificationCenter.vue apps/web/src/styles.css tests/e2e/app.spec.ts
git commit -m "feat: move support and notifications to task screens"
```

### Task 4: Admin Task Screens

**Files:**
- Create: `apps/web/src/features/admin/task/AdminClientScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminMailingScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminMailingDetailScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminStorageScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminServerLogsScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminPermissionScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminStatisticsDetailScreen.vue`
- Create: `apps/web/src/features/admin/task/AdminReleaseNotesScreen.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: all `apps/web/src/features/admin/*.test.ts` affected by modal assertions
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Routes: all `/admin/...` paths from the approved spec.
- Reuses: existing API methods, refs, validation, and mutations from `AdminSection` through explicit props/emits while extraction proceeds.

- [ ] **Step 1: Add failing route/source tests for every admin task route**

Assert that each large admin scenario uses `TaskScreen`, contains no `aria-modal`, and returns to the originating admin panel after save/close.

- [ ] **Step 2: Run RED admin tests**

Run: `pnpm --filter @club/web test -- features/admin`
Expected: FAIL on new task-screen expectations.

- [ ] **Step 3: Extract client, statistics, releases, mailings, storage, server, transfer, and permissions**

Move markup without changing API calls. Route params replace selected-entity modal IDs. High-risk owner transfer and permission changes retain explicit `ConfirmDialog` before submission.

- [ ] **Step 4: Verify admin behavior**

Run: `pnpm --filter @club/web test -- features/admin && .\\node_modules\\.bin\\playwright.cmd test --grep "admin|mailing|storage|server"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/admin apps/web/src/styles.css tests/e2e/app.spec.ts
git commit -m "feat: move admin workflows to task screens"
```

### Task 5: Payments Task Screens and Provider Sheet

**Files:**
- Create: `apps/web/src/features/billing/PaymentProviderScreen.vue`
- Create: `apps/web/src/features/billing/PaymentPlanScreen.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/billing/*.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Routes: `/payments/provider`, `/payments/plans/new`, `/payments/plans/:planId/edit`.
- Overlay retained: provider picker `BottomSheet`, payment action `ConfirmDialog`.

- [ ] **Step 1: Write failing tests and run RED**

Run: `pnpm --filter @club/web test -- features/billing`
Expected: FAIL because provider/plan forms are still modal.

- [ ] **Step 2: Move forms to task screens**

Preserve provider credentials, tariff validation, create/edit/delete actions, payment confirmation, and owner-only controls.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @club/web test -- features/billing && .\\node_modules\\.bin\\playwright.cmd test --grep "payment|tariff"`
Expected: PASS.

```bash
git add apps/web/src/features/billing apps/web/src/styles.css tests/e2e/app.spec.ts
git commit -m "feat: move payment forms to task screens"
```

### Task 6: Learning and Profile Task Screens

**Files:**
- Create: `apps/web/src/features/learning/ModuleEditorScreen.vue`
- Create: `apps/web/src/features/learning/LessonScreen.vue`
- Create: `apps/web/src/features/learning/LessonEditorScreen.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/*.test.ts`
- Create: `apps/web/src/features/profile/AvatarEditorScreen.vue`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/avatarGesture.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Routes: `/learning/modules/...`, `/learning/lessons/...`, `/profile/avatar`.
- Overlay retained: logout `ConfirmDialog`; image/video playback `MediaViewer`.

- [ ] **Step 1: Add failing learning/profile task-screen tests and run RED**

Run: `pnpm --filter @club/web test -- features/learning features/profile`
Expected: FAIL on modal removal assertions.

- [ ] **Step 2: Move module, lesson, and avatar workflows**

Preserve uploads, background upload indicator, lesson content, progress, archive behavior, avatar pinch/drag, and save/cancel actions.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @club/web test -- features/learning features/profile && .\\node_modules\\.bin\\playwright.cmd test --grep "module|lesson|avatar"`
Expected: PASS.

```bash
git add apps/web/src/features/learning apps/web/src/features/profile apps/web/src/styles.css tests/e2e/app.spec.ts
git commit -m "feat: move learning and profile editors to task screens"
```

### Task 7: Overlay Cleanup and Full Regression

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Final allowed overlays: `ConfirmDialog`, `BottomSheet`, media viewers, push permission, transient operation indicators.

- [ ] **Step 1: Add failing overlay inventory test**

The test scans Vue sources and rejects legacy `admin-client-modal`, `support-ticket-modal`, `payment-form-modal`, and long-form modal backdrops outside compatibility-free files.

- [ ] **Step 2: Remove legacy modal CSS and gesture interception**

Delete universal modal height variables, keyboard modal compensation, obsolete backdrop selectors, and App-level modal pinch interception. Keep safe-area and keyboard logic used by chat/task screens.

- [ ] **Step 3: Bump service worker cache**

Increment `club-pwa-v37` to the next version and update its test.

- [ ] **Step 4: Run complete verification**

Run:

```bash
pnpm --filter @club/web test
pnpm --filter @club/web build
.\\node_modules\\.bin\\playwright.cmd test
git diff --check
```

Expected: all commands exit 0, no horizontal overflow, no large modal fixtures remain.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/public/sw.js tests/e2e/app.spec.ts
git commit -m "refactor: complete routed task screen migration"
```

### Task 8: Publish and Production Verification

**Files:** none beyond deployment state.

- [ ] **Step 1: Push main**

Run: `git push origin main`
Expected: remote main advances to the final verified commit.

- [ ] **Step 2: Deploy**

Run the existing `/opt/club-pwa/deploy/update.sh` on the server. Do not force a no-cache build unless the built assets do not match the commit.

- [ ] **Step 3: Verify production**

Check server commit, `docker compose ps`, `/api/health`, live service worker version, route deep links, and production CSS/JS asset hashes.

- [ ] **Step 4: Mobile smoke**

Open support reply, mailing editor, client details, payment plan editor, lesson editor, avatar editor, compact confirmation, bottom sheet, and media viewer. Verify Back and keyboard behavior.
