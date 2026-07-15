# New Email Emergency Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разрешить владельцу генерировать аварийный код входа для ещё не зарегистрированного email без ослабления одноразовости, аудита и rate limit.

**Architecture:** Сохраняем единый механизм `auth_email_login_codes` и обычную верификацию, создающую пользователя после правильного кода. Endpoint администратора перестаёт требовать строку `users`, а ограничение повторов ищет недавнее аудиторское событие по `metadata.email`.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Vitest, Vue 3.

## Global Constraints

- Endpoint остаётся owner-only.
- Код не попадает в audit metadata.
- Cooldown остаётся равным 30 секундам.
- Новый пользователь создаётся только после успешной проверки кода.

---

### Task 1: API generation for a new email

**Files:**
- Modify: `apps/api/src/auth/ownerEmailLoginCode.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: `POST /admin/owner-email-login-code` with `{ email: string }`.
- Produces: the existing `OwnerEmailLoginCodeResponse` for both existing and new emails.

- [ ] **Step 1: Write the failing test**

Add source assertions proving the route does not return `Клиент с таким email не найден`, uses `sql`${adminActionLogs.metadata} ->> 'email' = ${email}`` for cooldown, and permits nullable audit targets.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/api exec vitest run src/auth/ownerEmailLoginCode.test.ts`
Expected: FAIL because the current route still returns 404 and rate-limits by `targetUserId`.

- [ ] **Step 3: Write minimal implementation**

Keep the optional `users` lookup, remove the 404 branch, query recent audit rows by `metadata.email`, and write `user?.id ?? null` / `user?.telegramId ?? null` to the audit record.

- [ ] **Step 4: Run focused and full verification**

Run: `pnpm --filter @club/api exec vitest run src/auth/ownerEmailLoginCode.test.ts`, then `pnpm test`, `pnpm build`, and `git diff --check`.
Expected: all commands exit 0.

- [ ] **Step 5: Version and deployment**

Bump the application and PWA cache versions, commit, push `main`, run `deploy/update.sh`, and verify the production health endpoint and published asset version.
