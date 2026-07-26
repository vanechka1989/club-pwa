# Full Application Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить подтверждённые аудитом UI, security, scalability и release-gate дефекты Club PWA.

**Architecture:** Сначала восстанавливается наблюдаемое UI-поведение, затем вводятся изолированные policy/helpers для медиа, агрегаций, пагинации и rate limiting. Публичные ответы расширяются совместимо, а тяжёлые операции переводятся на ограниченные SQL-запросы.

**Tech Stack:** Vue 3, Pinia, Vite, Hono, Bun, Drizzle ORM, PostgreSQL, Vitest, Playwright.

## Global Constraints

- Сохранять текущую бизнес-логику платежей и роли пользователей.
- Все изменения поведения выполнять test-first и наблюдать ожидаемое падение теста.
- Не кешировать приватные API-ответы и медиа публично.
- Поддерживать ширины 320, 390, 768, 1024 и 1440 px.
- Не добавлять новую инфраструктурную зависимость, если PostgreSQL или существующий Redis покрывает задачу.

---

### Task 1: Device-mode и расширенный release gate

**Files:**
- Modify: `apps/web/src/features/app/deviceMode.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/features/app/DeviceModeNotice.vue`
- Modify: `apps/web/src/features/app/deviceMode.test.ts`
- Modify: `tests/e2e/app.spec.ts`
- Modify: `playwright.release.config.ts`

**Interfaces:**
- Produces: `getDeviceModeNoticeKind(mode, standalone)` возвращает только неблокирующую подсказку; интерфейс остаётся доступным.

- [ ] **Step 1: Add a failing regression test**

```ts
it("does not block a desktop user who already continued", () => {
  expect(getDeviceModeNoticeKind("desktop", false, true)).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and confirm the new assertion fails**

Run: `pnpm --filter @club/web test -- deviceMode.test.ts`

- [ ] **Step 3: Implement persisted dismissal and make the dialog non-blocking for authenticated shells**

```ts
export function getDeviceModeNoticeKind(mode: DeviceMode, standalone: boolean, dismissed = false) {
  if (dismissed) return null;
  if (mode === "mobile-desktop") return standalone ? null : "mobile-desktop";
  return mode === "desktop" ? "desktop" : null;
}
```

- [ ] **Step 4: Expand release grep/projects to desktop, themes, payments, and task screens**

```ts
grep: /keeps core sections|keeps design theme|routed PWA screens responsive|database backup tools/
```

- [ ] **Step 5: Run focused unit and desktop E2E tests**

Run: `pnpm --filter @club/web test -- deviceMode.test.ts && pnpm exec playwright test --project=desktop-chrome`

### Task 2: Защищённая выдача локальных медиа

**Files:**
- Create: `apps/api/src/storage/mediaAccess.ts`
- Create: `apps/api/src/storage/mediaAccess.test.ts`
- Modify: `apps/api/src/storage/localUploads.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Modify: `apps/api/src/routes/support.ts`
- Modify: `apps/api/src/routes/community.ts`

**Interfaces:**
- Produces: `authorizeLocalMedia({ key, userId, role }): Promise<boolean>` and private cache headers.

- [ ] **Step 1: Add failing authorization and cache-policy tests**

```ts
expect(await authorizeLocalMedia({ key: "support/ticket-a/file.webp", userId: "other" })).toBe(false);
expect(privateMediaHeaders["Cache-Control"]).toContain("private");
```

- [ ] **Step 2: Run and observe failure because the policy does not exist**

Run: `pnpm --filter @club/api test -- mediaAccess.test.ts`

- [ ] **Step 3: Implement entity lookup based on stored object keys and current session**

```ts
export async function authorizeLocalMedia(input: MediaAccessInput) {
  return Boolean(await resolveAccessibleMediaOwner(input));
}
```

- [ ] **Step 4: Put `telegramAuth` and media authorization before file reads; return 404 on denial**

- [ ] **Step 5: Run storage, learning, support, and community route tests**

Run: `pnpm --filter @club/api test -- mediaAccess localUploads support community learning`

### Task 3: Точные административные агрегаты

**Files:**
- Create: `apps/api/src/admin/statsSummary.ts`
- Create: `apps/api/src/admin/statsSummary.test.ts`
- Modify: `apps/api/src/routes/admin.ts`

**Interfaces:**
- Produces: `getAdminStatsSummary(): Promise<{totalUsers:number; activeUsers:number; completedItems:number}>`.

- [ ] **Step 1: Add a failing test with 201 users where the first user is active**

```ts
expect(summary).toEqual({ totalUsers: 201, activeUsers: 1, completedItems: 7 });
```

- [ ] **Step 2: Run and confirm the old recent-200 calculation fails**

Run: `pnpm --filter @club/api test -- statsSummary.test.ts`

- [ ] **Step 3: Implement independent SQL count/sum queries over the full dataset**

- [ ] **Step 4: Replace response totals while retaining the 200-user preview list**

- [ ] **Step 5: Run admin stats tests**

Run: `pnpm --filter @club/api test -- adminStats statsSummary`

### Task 4: Cursor pagination for heavy lists

**Files:**
- Create: `apps/api/src/pagination/cursor.ts`
- Create: `apps/api/src/pagination/cursor.test.ts`
- Modify: `apps/api/src/routes/support.ts`
- Modify: `apps/api/src/routes/community.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`

**Interfaces:**
- Produces: `{ items, nextCursor }`, cursor is opaque base64url encoded `{createdAt,id}`; page size is clamped to `1..100`.

- [ ] **Step 1: Add failing cursor round-trip and clamp tests**
- [ ] **Step 2: Run `pnpm --filter @club/api test -- cursor.test.ts` and observe failure**
- [ ] **Step 3: Implement encode/decode and keyset predicates**
- [ ] **Step 4: Add pagination to support tickets, community messages, polls, and action logs**
- [ ] **Step 5: Update frontend clients to append pages without replacing existing state**
- [ ] **Step 6: Run route and frontend tests**

### Task 5: Persistent write rate limiting

**Files:**
- Create: `apps/api/src/security/writeRateLimit.ts`
- Create: `apps/api/src/security/writeRateLimit.test.ts`
- Add: Drizzle migration for write limit buckets.
- Modify: community/support/learning write routes.

**Interfaces:**
- Produces: `consumeWriteLimit({ scope, actorId, limit, windowMs }): Promise<WriteLimitStatus>`.

- [ ] **Step 1: Add failing tests for allowed, exhausted, and reset windows**
- [ ] **Step 2: Run and verify the missing implementation fails**
- [ ] **Step 3: Implement atomic PostgreSQL upsert using the existing auth limiter pattern**
- [ ] **Step 4: Return `429` with `{code:"WRITE_RATE_LIMIT",retryAfterSeconds}` from protected routes**
- [ ] **Step 5: Run security and route tests**

### Task 6: Frontend payload and offline performance

**Files:**
- Modify: `apps/web/src/features/app/DeviceModeNotice.vue`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/serviceWorkerLifecycle.test.ts`

**Interfaces:**
- QR library is loaded via dynamic `import("qrcode")`; service worker never caches `/api/`.

- [ ] **Step 1: Add failing tests for deferred QR loading and private API cache exclusion**
- [ ] **Step 2: Run focused tests and observe failure**
- [ ] **Step 3: Replace eager QR import with dynamic import and keep network-first navigation/offline fallback**
- [ ] **Step 4: Build and compare initial bundle output**

### Task 7: Dependency and CI security checks

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/pwa-quality.yml`
- Modify: `package.json`

**Interfaces:**
- Produces scripts `audit:prod` and `test:e2e:release`; registry/network failures are distinguishable from discovered advisories.

- [ ] **Step 1: Extend `apps/api/src/deploy/securityConfig.test.ts` to execute the workflow policy checks and fail when `audit:prod` or the expanded release command is absent**
- [ ] **Step 2: Add `pnpm audit --prod` and lockfile/outdated reporting without automatic major upgrades**
- [ ] **Step 3: Run workflow tests and the audit command**

### Task 8: Final verification and focused decomposition

**Files:**
- Refactor only files materially changed by Tasks 1-7.
- Update: architecture/operations documentation when contracts changed.

**Interfaces:**
- No public behavior changes beyond the specification.

- [ ] **Step 1: Extract cohesive helpers from modified mega-files while tests are green**
- [ ] **Step 2: Run `pnpm check`, `pnpm test`, and `pnpm build`**
- [ ] **Step 3: Run release E2E, desktop E2E, and the device matrix**
- [ ] **Step 4: Audit 320, 390, 768, 1024, and 1440 px with screenshots and accessibility checks**
- [ ] **Step 5: Review `git diff`, confirm no secrets or unrelated files, and document remaining external limitations**
