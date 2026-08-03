# Owner-Only Full Client Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bright-red, confirmed, owner-only action that completely removes an ordinary client and their related records/files without permitting deletion of owners or administrators.

**Architecture:** A focused API deletion module owns policy checks, object-key discovery and transactional database cleanup; the admin route supplies the authenticated actor and maps domain outcomes to HTTP responses. The existing client card emits a delete request to `AdminSection`, which uses the shared danger confirmation dialog, calls the typed API client, closes the task only after success and reloads admin data.

**Tech Stack:** TypeScript, Hono, Drizzle ORM/PostgreSQL, Vue 3, Pinia session state, Vitest, Playwright, Lucide Vue, existing S3 storage adapter.

## Global Constraints

- Only the real owner may delete a client; preview roles never grant deletion rights.
- Owners and every account represented in `admin_users` are protected targets.
- The action is irreversible and always requires a danger confirmation.
- The header control is bright red, has a white trash icon, an accessible name and a minimum `44 × 44 px` target.
- Client-owned database records and S3 objects are removed; the administrative deletion log remains without a live target foreign key.
- Release metadata, history and service-worker cache revision must advance together.

---

### Task 1: Server deletion policy and transaction

**Files:**
- Create: `apps/api/src/admin/clientDeletion.ts`
- Create: `apps/api/src/admin/clientDeletion.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/admin/clientDeletion.test.ts`

**Interfaces:**
- Produces: `deleteClientAccount(input, dependencies): Promise<ClientDeletionResult>` with outcomes `deleted`, `not-found`, `forbidden-actor`, `protected-target`, and `conflict`.
- Consumes: target Telegram ID, real-owner predicate, user/admin queries, a transaction callback, S3 deletion callback and audit identity.

- [ ] **Step 1: Write failing policy/orchestration tests**

Cover a non-owner actor, missing target, owner target, administrator target, a regular client, preservation of the audit snapshot, deletion ordering, unique object keys and repeated deletion returning `not-found`.

```ts
expect(await deleteClientAccount(input, nonOwnerDeps)).toEqual({ status: "forbidden-actor" });
expect(await deleteClientAccount(input, ownerTargetDeps)).toEqual({ status: "protected-target" });
expect(steps).toEqual(["collect-files", "transaction", "delete-files"]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/api test src/admin/clientDeletion.test.ts`

Expected: FAIL because `clientDeletion.ts` and `deleteClientAccount` do not exist.

- [ ] **Step 3: Implement the deletion module**

Define dependency boundaries so policy and ordering are testable without a production database. Deduplicate non-empty object keys, run the database transaction before object deletion, and return a conflict without deleting files when the transaction fails.

```ts
export type ClientDeletionResult =
  | { status: "deleted"; deletedTelegramId: string; deletedObjectCount: number }
  | { status: "not-found" | "forbidden-actor" | "protected-target" | "conflict" };
```

- [ ] **Step 4: Add the owner-only route wiring**

Add `DELETE /admin/stats/users/:telegramId`. Resolve the real actor from `c.get("telegramUser").id`, reject preview access, protect owner/admin targets, collect avatar/homework/community/support/notification object keys, and in one transaction:

1. insert `client.deleted` into `admin_action_logs` with the target snapshot;
2. delete the target's recurrent subscriptions and payment orders;
3. delete the target's individual offers;
4. delete the user row so existing cascades remove remaining client data.

Delete collected keys from primary and reserve storage after commit. Map domain outcomes to `200`, `403`, `404`, or `409`.

- [ ] **Step 5: Run focused API tests and commit**

Run: `pnpm --filter @club/api test src/admin/clientDeletion.test.ts src/admin/adminActionLogs.test.ts`

Commit: `feat: add owner-only full client deletion api`

---

### Task 2: Client API and confirmed bright-red header action

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminClientDetailTask.test.ts`
- Modify: `apps/web/src/features/admin/adminClientCard.test.ts`
- Test: `apps/web/src/features/admin/adminClientDeletion.test.ts`

**Interfaces:**
- Consumes: `DELETE /admin/stats/users/:telegramId`.
- Produces: `deleteAdminClient(telegramId): Promise<{ ok: true; deletedTelegramId: string }>` and the `request-client-delete` panel event.

- [ ] **Step 1: Write failing UI/API contract tests**

Assert that the API helper uses `DELETE`, the trash action is rendered in the `TaskScreen` actions slot only when `canDeleteSelectedUser`, the button has `aria-label="Удалить клиента"`, uses `Trash2`, and the parent checks `isOwner && selectedUser.role === "member"`.

```ts
expect(source).toContain('<template #actions>');
expect(source).toContain('aria-label="Удалить клиента"');
expect(source).toContain("admin-client-delete-button");
```

- [ ] **Step 2: Run focused web tests and verify RED**

Run: `pnpm --filter @club/web test src/features/admin/adminClientDeletion.test.ts`

Expected: FAIL because the helper, event and button are absent.

- [ ] **Step 3: Implement API helper and card action**

Add `deleteAdminClient`. Add `canDeleteSelectedUser` and `deletingClient` props plus `request-client-delete` emit. Render a bright-red icon button in the existing header action slot with `Trash2`, white icon, disabled/busy state and `44 × 44 px` sizing that stays inline on 320 px screens.

- [ ] **Step 4: Implement confirmed parent flow**

Use `appDialogs.confirm` with danger tone, client name and irreversible copy. On cancel, make no request. On confirm, guard the real owner/member state again, call `deleteAdminClient`, close the client route, reload admin data and show `Клиент полностью удалён.`. On failure, keep the card open and show the server-safe error.

- [ ] **Step 5: Run focused web tests and commit**

Run: `pnpm --filter @club/web test src/features/admin/adminClientDeletion.test.ts src/features/admin/adminClientCard.test.ts src/features/admin/adminClientDetailTask.test.ts`

Commit: `feat: add confirmed client deletion action`

---

### Task 3: Responsive interaction verification

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: owner client-card fixtures and the delete endpoint mock.
- Produces: release regression coverage for visibility, confirmation, cancellation, successful deletion and mobile geometry.

- [ ] **Step 1: Add failing Playwright coverage**

Open a regular member card as owner, assert the red trash button is at least `44 × 44 px`, cancel once and confirm no request, then confirm deletion and assert one `DELETE` request plus return to the client list. Add a regular-admin fixture that never renders the action.

- [ ] **Step 2: Run the focused mobile scenario and verify RED**

Run: `pnpm exec playwright test tests/e2e/app.spec.ts --project=android-compact-320 --grep "deletes a client only after owner confirmation"`

Expected: FAIL before the fixture/action integration is complete.

- [ ] **Step 3: Complete fixture behavior and run mobile matrix**

Run the scenario at `android-compact-320`, `viewport-390-844`, `tablet-768-1024` and `android-landscape-844-390`. Inspect the 390 px screenshot and fix overflow, alignment or contrast defects.

- [ ] **Step 4: Commit**

Commit: `test: cover owner client deletion across devices`

---

### Task 4: Release history, full verification and production

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: release `6.18`, Russian/English history entry and service-worker cache `club-pwa-v290`.

- [ ] **Step 1: Write failing release expectations**

Expect version `6.18`, title `Полное удаление клиентов`, history retention of `6.17`, and cache `club-pwa-v290`.

- [ ] **Step 2: Run release tests and verify RED**

Run: `pnpm --filter @club/web test src/features/app/releaseNotes.test.ts src/features/app/pwa.test.ts`

- [ ] **Step 3: Update release metadata and history**

Describe owner-only access, irreversible confirmation and complete related-data cleanup in Russian and English; move `6.17` into history and increment the cache.

- [ ] **Step 4: Run all local verification**

Run in order:

```text
pnpm check
pnpm test
pnpm build
pnpm test:e2e:release
git diff --check
```

- [ ] **Step 5: Commit, preflight, push and deploy exact commit**

Commit: `chore: release full client deletion v6.18`

Verify `club2.myn8nservertest.ru` resolves publicly to `2.27.28.89`, server directory is `/opt/club-pwa`, local/server remotes match, no deployment is active, and server HEAD/deployed marker identify the previous release. Push exact `main` and let the normal `Deploy to VPS` workflow run `/opt/club-pwa/deploy/update.sh`.

- [ ] **Step 6: Verify production and notification**

Confirm public `/`, `/api/health`, `/api/ready`, version `6.18`, cache `club-pwa-v290`, deployed editor/admin assets, GitHub workflow success, server HEAD, deployed marker, healthy `api/web/postgres/caddy`, zero new critical log errors and `{"created":true,"reason":"created"}` for the owner release notification.
