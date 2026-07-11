# Login IP Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record unique login IPs per client, update their timestamps on IP changes, and expose them only through the «IP входов» admin permission.

**Architecture:** A focused `loginIpAudit` service normalizes the proxy-provided address and upserts `user_login_ips`. Each auth session stores its last observed IP so normal API traffic does not generate repeated writes. A dedicated protected admin endpoint feeds a conditional section in the existing client card.

**Tech Stack:** Hono, Drizzle ORM/PostgreSQL, Zod shared contracts, Vue 3/Pinia, Vitest.

## Global Constraints

- Store exact normalized IPv4/IPv6 values without automatic expiry; cascade-delete them with the user.
- Record only a new session or a change from `auth_sessions.lastIpAddress`; never record unauthenticated requests.
- Reuse an existing `(userId, ipAddress)` row and update `lastSeenAt`/`loginCount` when an address returns.
- Access requires owner status or the separate `login_ips` permission labelled «IP входов».
- Caddy is the only trusted public proxy boundary; invalid addresses do not block authentication.

---

### Task 1: Shared permission and IP response contracts

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/adminPermissions.test.ts`
- Create: `packages/shared/src/loginIps.test.ts`

**Interfaces:**
- Produces: `AdminPermission` value `login_ips`, label `IP входов`, `adminLoginIpSchema`, `AdminLoginIp`, `adminLoginIpsResponseSchema`, `AdminLoginIpsResponse`.

- [ ] **Step 1: Write failing contract tests** asserting `adminPermissionSchema.parse("login_ips")`, the exact label, and parsing `{ loginIps: [{ id, ipAddress, firstSeenAt, lastSeenAt, loginCount }] }`.
- [ ] **Step 2: Run RED** with `pnpm --filter @club/shared test -- adminPermissions.test.ts loginIps.test.ts`; expect unknown permission/schema exports.
- [ ] **Step 3: Implement minimal Zod contracts**:

```ts
export const adminLoginIpSchema = z.object({
  id: z.string().uuid(),
  ipAddress: z.string().min(1),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  loginCount: z.number().int().positive()
});
export const adminLoginIpsResponseSchema = z.object({ loginIps: z.array(adminLoginIpSchema) });
```

- [ ] **Step 4: Run GREEN** with the same command; expect all tests pass.
- [ ] **Step 5: Commit** `feat(shared): add login IP audit contracts`.

### Task 2: Persistence and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0034_user_login_ips.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create/modify generated snapshot under `apps/api/drizzle/meta/`.

**Interfaces:**
- Produces: `userLoginIps` table and nullable `authSessions.lastIpAddress`.

- [ ] **Step 1: Add a failing schema source test** in `apps/api/src/db/loginIpSchema.test.ts` checking the unique `(userId, ipAddress)` index and session field.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/api test -- loginIpSchema.test.ts`; expect missing schema declarations.
- [ ] **Step 3: Add the Drizzle table** with UUID id, user FK, `varchar("ip_address", { length: 45 })`, positive integer default 1, first/last timestamps, unique user/IP index, and user/last-seen index; add relation to users.
- [ ] **Step 4: Generate migration** using `pnpm --filter @club/api db:generate`; inspect SQL for `user_login_ips`, both indexes and `auth_sessions.last_ip_address`.
- [ ] **Step 5: Run GREEN** plus `pnpm --filter @club/api check`.
- [ ] **Step 6: Commit** `feat(api): add login IP audit persistence`.

### Task 3: Trusted IP extraction and audit service

**Files:**
- Create: `apps/api/src/security/clientIp.ts`
- Create: `apps/api/src/security/clientIp.test.ts`
- Create: `apps/api/src/security/loginIpAudit.ts`
- Create: `apps/api/src/security/loginIpAudit.test.ts`
- Modify: `deploy/Caddyfile`

**Interfaces:**
- Produces: `getTrustedClientIp(headers: Headers): string | null` and `recordLoginIpChange({ userId, sessionId, previousIpAddress, ipAddress, now? }): Promise<boolean>`.

- [ ] **Step 1: Write failing normalization tests** for IPv4, bracketed IPv6, `::ffff:192.0.2.1`, invalid values and Caddy forwarding priority.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/api test -- clientIp.test.ts`; expect missing module.
- [ ] **Step 3: Implement normalization** with Node `isIP`, stripping brackets/ports only when valid and converting IPv4-mapped IPv6 to IPv4.
- [ ] **Step 4: Write failing audit tests** proving same IP returns `false`, new IP inserts, and returning IP performs conflict update/increments count.
- [ ] **Step 5: Run RED**: `pnpm --filter @club/api test -- loginIpAudit.test.ts`.
- [ ] **Step 6: Implement one transaction** that upserts `userLoginIps` and updates `authSessions.lastIpAddress` only when the normalized address differs.
- [ ] **Step 7: Configure Caddy** to overwrite forwarded client headers sent to `api:3000`, rather than forwarding arbitrary client values unchanged.
- [ ] **Step 8: Run GREEN** for both tests and API typecheck.
- [ ] **Step 9: Commit** `feat(api): record trusted login IP changes`.

### Task 4: Connect audit to auth lifecycle

**Files:**
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/security/loginIpIntegration.test.ts`

**Interfaces:**
- Consumes: `getTrustedClientIp`, `recordLoginIpChange`.

- [ ] **Step 1: Write failing source/integration tests** asserting email verification stores the first IP/session value and authenticated middleware calls the audit only after a valid session is resolved.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/api test -- loginIpIntegration.test.ts`.
- [ ] **Step 3: On `/email/verify`**, obtain trusted IP, create the session returning its id, then call the audit service without failing login when IP is unavailable.
- [ ] **Step 4: In `sessionAuth`**, compare current trusted IP to `session.lastIpAddress`; call the audit service only on change, while retaining existing `lastSeenAt` behavior.
- [ ] **Step 5: Run GREEN** and the existing auth tests.
- [ ] **Step 6: Commit** `feat(api): capture IP changes during authenticated sessions`.

### Task 5: Protected admin endpoint

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/admin/loginIpsAccess.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `GET /admin/stats/users/:telegramId/login-ips` and `getAdminUserLoginIps(telegramId): Promise<AdminLoginIpsResponse>`.

- [ ] **Step 1: Write failing access tests** for owner/`login_ips` success and an admin with only `users` receiving 403.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/api test -- loginIpsAccess.test.ts`.
- [ ] **Step 3: Implement route-level `rejectIfNotOwner(c, "login_ips")`**, resolve the target user, query ordered by `lastSeenAt DESC`, serialize ISO dates, and set `Cache-Control: no-store`.
- [ ] **Step 4: Add the typed web client function** without placing IPs in the general client list response.
- [ ] **Step 5: Run GREEN**, API check and web check.
- [ ] **Step 6: Commit** `feat(admin): expose protected client login IP history`.

### Task 6: Client-card IP history UI

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/admin/adminPanels.test.ts`

**Interfaces:**
- Consumes: `session.user.adminPermissions`, `getAdminUserLoginIps`.

- [ ] **Step 1: Write failing UI tests** proving the request/section exist only with `login_ips`, empty copy is exact, and long addresses have `overflow-wrap: anywhere`.
- [ ] **Step 2: Run RED**: `pnpm --filter @club/web test -- adminPanels.test.ts`.
- [ ] **Step 3: Add state** for loading/error/history and `canViewLoginIps = owner || adminPermissions.includes("login_ips")`; fetch only after a client opens and only when allowed.
- [ ] **Step 4: Render «IP входов»** with latest first, exact IP, first/last dates, count, a 24-hour «Новый IP» badge, loading/error/empty states.
- [ ] **Step 5: Add token-based responsive CSS** with no fixed heights, `min-width:0`, `overflow-wrap:anywhere`, and one-column rows on narrow phones.
- [ ] **Step 6: Run GREEN**, web build, and targeted browser screenshots at 390×844 for empty, IPv4 and long IPv6 states.
- [ ] **Step 7: Commit** `feat(web): show protected login IP history in client card`.

### Task 7: Version, regression and deployment verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] **Step 1: Write/update failing version/cache assertions** for the next patch and cache generation.
- [ ] **Step 2: Run RED** with the targeted PWA/release tests.
- [ ] **Step 3: Update version, cache and release notes** describing IP history and permission boundaries.
- [ ] **Step 4: Run GREEN**, `pnpm --filter @club/shared test`, `pnpm --filter @club/api test`, `pnpm --filter @club/web test`, all three builds/checks, and `git diff --check`.
- [ ] **Step 5: Apply migration in deployment**, verify API/web health, confirm unauthorized endpoint 403 and authorized seeded scenario returns ordered unique IPs.
- [ ] **Step 6: Commit** `release: add login IP audit`.
