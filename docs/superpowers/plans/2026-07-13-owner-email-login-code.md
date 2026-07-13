# Owner Email Login Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить владельцу/«Главному админу» безопасную генерацию штатного одноразового email-кода для существующего клиента.

**Architecture:** Новый owner-only endpoint в существующем admin router переиспользует `normalizeEmail`, `createLoginCode`, `hashAuthToken` и таблицу `auth_email_login_codes`. В «Настройках проекта» owner-only карточка вызывает endpoint и показывает код только в текущем состоянии страницы; обычная `/auth/email/verify` принимает его без изменений.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Zod, Vue 3, TypeScript, Vitest, Vite.

## Global Constraints

- Реальная серверная роль должна быть строго `owner`; разрешение `project_settings` не расширяет доступ.
- Генерация работает только для существующего пользователя с совпадающим нормализованным email.
- Код содержит ровно 6 цифр, действует `AUTH_LOGIN_CODE_TTL_MINUTES`, хранится только как хеш и показывается один раз.
- Все прежние неиспользованные коды email аннулируются до создания нового.
- Аудит содержит исполнителя, клиента, email и срок действия, но не код и не его хеш.
- Повторная owner-генерация для одного клиента блокируется на 30 секунд.
- Релиз: приложение `4.12`, service worker `club-pwa-v113`.

---

### Task 1: Owner-only API и контракт

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/auth/ownerEmailLoginCode.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail(value)`, `createLoginCode()`, `hashAuthToken(value)`, `env.AUTH_LOGIN_CODE_TTL_MINUTES`, `rejectIfNotOwner(c)`.
- Produces: `POST /api/admin/owner-email-login-code` with `{ email: string }`; response `{ ok: true, email: string, code: string, expiresAt: string }`.

- [ ] **Step 1: Write the failing API source/contract test**

Assert that the route calls `rejectIfNotOwner(c)` without a permission fallback, normalizes email, requires an existing `users.email`, marks prior unused `authEmailLoginCodes` consumed, inserts `hashAuthToken(\`${email}:${code}\`)`, and records `owner.email_login_code.generated` without placing `code` in metadata. Parse a representative success response with the exported Zod schema and require `/^\\d{6}$/`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @club/api exec vitest run src/auth/ownerEmailLoginCode.test.ts`

Expected: FAIL because the contract and route do not exist.

- [ ] **Step 3: Add the shared response contract**

Add:

```ts
export const ownerEmailLoginCodeResponseSchema = z.object({
  ok: z.literal(true),
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  expiresAt: z.string().datetime()
});
export type OwnerEmailLoginCodeResponse = z.infer<typeof ownerEmailLoginCodeResponseSchema>;
```

- [ ] **Step 4: Implement the route transaction and audit**

In `admin.ts`, add the email schema, import the existing auth helpers/table, reject non-owner before processing, find the user, enforce a 30-second cooldown from `admin_action_logs`, and run a transaction that consumes unused codes and inserts the new hashed code. Return the raw code only in the response. Record:

```ts
await recordAdminAction(c, {
  action: "owner.email_login_code.generated",
  entityType: "user",
  entityId: user.id,
  targetUserId: user.id,
  targetTelegramId: user.telegramId,
  summary: `Создал аварийный код входа для ${email}`,
  metadata: { email, expiresAt: expiresAt.toISOString() }
});
```

- [ ] **Step 5: Run focused test and type checks**

Run: `pnpm --filter @club/api exec vitest run src/auth/ownerEmailLoginCode.test.ts && pnpm --filter @club/shared check && pnpm --filter @club/api check`

Expected: PASS and exit code 0.

### Task 2: Компактная owner-only карточка

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/admin/adminOwnerEmailLoginCode.test.ts`

**Interfaces:**
- Consumes: `OwnerEmailLoginCodeResponse`, `session.user.realRole`, `/admin/owner-email-login-code`.
- Produces: `generateOwnerEmailLoginCode(payload: { email: string })` and the owner-only project settings card.

- [ ] **Step 1: Write the failing UI test**

Assert that the API helper posts to `/admin/owner-email-login-code`, the card is guarded by `v-if="isOwner"`, input uses `type="email"`, result renders `generatedEmailLoginCode.code`, and copy/create-another controls exist. Assert the CSS uses a compact responsive grid and `font-variant-numeric: tabular-nums` for the code.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @club/web exec vitest run src/features/admin/adminOwnerEmailLoginCode.test.ts`

Expected: FAIL because helper/card/styles do not exist.

- [ ] **Step 3: Add API helper and component state**

Add refs for email, result, loading, error and copy feedback. Implement generation with trimmed lowercase email, clear stale code before request, and preserve server error text. Implement copying only `result.code`.

- [ ] **Step 4: Add the compact card**

Place it after the referral card. Show the email field and primary generation button; after success show email, six-digit code, expiry copy, «Скопировать код» and «Создать другой». Keep all controls at least 44px high and prevent horizontal overflow at 360px.

- [ ] **Step 5: Run focused test and web check**

Run: `pnpm --filter @club/web exec vitest run src/features/admin/adminOwnerEmailLoginCode.test.ts && pnpm --filter @club/web check`

Expected: PASS and exit code 0.

### Task 3: Release, regression and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: version `4.12`, release title `Аварийный код входа`, cache `club-pwa-v113`.

- [ ] **Step 1: Change release tests to 4.12/v113 and confirm RED**

Run the two focused test files and require the new version, title and cache.

- [ ] **Step 2: Add release entry and cache bump**

Add a new top release note explaining owner-only generation, one-time 10-minute code and audit. Preserve `4.11` as an explicit historical entry.

- [ ] **Step 3: Run complete verification**

Run: `pnpm test && pnpm check && pnpm build && git diff --check`

Expected: all tests pass, checks/build exit 0, no whitespace errors.

- [ ] **Step 4: Perform mobile visual audit**

At 360×800 verify the owner card has no horizontal overflow, the generated code is readable, loading/result states are distinct and browser console has no errors.

- [ ] **Step 5: Commit, push and deploy**

Commit implementation, push `main`, run `/opt/club-pwa/deploy/update.sh` on `2.27.28.89`, then verify commit, `/api/health`, live version `4.12`, service-worker cache `v113`, assets and running `api,caddy,postgres,web` services.
