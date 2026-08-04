# Profile Access Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized profile hero with a compact identity/access card that shows a trustworthy current-access summary and only offers renewal during the final three days.

**Architecture:** The API derives a normalized `currentAccess` object from the active subscription and its authoritative payment/referral source. The web client renders that object without guessing from the order list, while focused pure helpers own renewal visibility and presentation fallbacks.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Zod, Vue 3, Pinia, Vitest, Playwright, CSS.

## Global Constraints

- Preserve existing payment, avatar, authentication, and membership behavior.
- Use `Подарочная подписка` for administrator-issued access and `Реферальный бонус` for referral access.
- Hide renewal while active access has more than three calendar days remaining and for active auto-renewal.
- Keep interactive targets at least 44×44 px and avoid overflow from 320 px through 1440 px.
- Deploy only the verified commit to `club2.myn8nservertest.ru` after the mandatory production preflight.

---

### Task 1: Shared Current-Access Contract

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/appState.test.ts`

**Interfaces:**
- Produces: `currentAccessSchema` and optional `currentAccess` on the public user schema.

- [ ] **Step 1: Write the failing schema test**

Add a user fixture containing:

```ts
currentAccess: {
  source: "one_time",
  title: "Клуб Premium",
  accessDays: 30,
  bonusDays: null,
  expiresAt: "2031-01-01T00:00:00.000Z",
  nextPaymentAt: null
}
```

Assert that the public user schema preserves it and rejects invalid negative durations.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @club/shared test -- appState.test.ts`
Expected: FAIL because `currentAccess` is absent from the schema.

- [ ] **Step 3: Add the contract**

Define the exact optional nullable object:

```ts
export const currentAccessSchema = z.object({
  source: z.enum(["one_time", "recurrent", "gift", "referral", "unknown"]),
  title: z.string().min(1),
  accessDays: z.number().int().positive().nullable(),
  bonusDays: z.number().int().positive().nullable(),
  expiresAt: z.string().datetime().nullable(),
  nextPaymentAt: z.string().datetime().nullable()
});
```

- [ ] **Step 4: Run the focused shared tests and verify GREEN**

Run: `pnpm --filter @club/shared test -- appState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/appState.test.ts
git commit -m "feat: add current access profile contract"
```

### Task 2: Server-Side Access Summary

**Files:**
- Create: `apps/api/src/membership/currentAccess.ts`
- Create: `apps/api/src/membership/currentAccess.test.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/routes/appState.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `CurrentAccess` shared type, current `subscriptions` row, latest compatible paid order snapshot, active recurrent subscription, and latest referral activation.
- Produces: `resolveCurrentAccess(input): CurrentAccess | null` and payment-order `accessDays` snapshots.

- [ ] **Step 1: Write failing resolver tests**

Cover `manual → gift`, `referral_bonus → referral`, one-time paid product, recurrent product, and unknown historical data. Assert exact titles, duration fields, expiry and next-payment values.

- [ ] **Step 2: Run resolver tests and verify RED**

Run: `pnpm --filter @club/api test -- src/membership/currentAccess.test.ts`
Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement the pure resolver**

Map providers as follows:

```ts
manual -> { source: "gift", title: "Подарочная подписка" }
referral_bonus -> { source: "referral", title: "Реферальный бонус" }
prodamus/lava -> source "one_time" with order snapshot
prodamus_recurrent/lava_recurrent -> source "recurrent" with subscription/order snapshot
fallback -> { source: "unknown", title: "Доступ к клубу" }
```

- [ ] **Step 4: Verify resolver GREEN**

Run: `pnpm --filter @club/api test -- src/membership/currentAccess.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing route/schema tests**

Assert `/me`, `/app-state`, and `/payments/orders` include `currentAccess`/`accessDays` and preserve individual-offer snapshots.

- [ ] **Step 6: Integrate authoritative queries and mapping**

Resolve the active subscription source on the server. Match paid access by stored provider payment identifier and order snapshot; use the latest compatible paid order only as a legacy fallback. Read the latest activated referral reward batch for `bonusDays`. Return `null` for inactive users.

- [ ] **Step 7: Run API tests and type checks**

Run: `pnpm --filter @club/api test -- src/membership/currentAccess.test.ts src/routes/me.test.ts src/routes/appState.test.ts`
Run: `pnpm --filter @club/api check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/membership packages/shared/src/index.ts apps/api/src/routes/me.ts apps/api/src/routes/appState.ts apps/api/src/routes/payments.ts
git commit -m "feat: expose current membership access summary"
```

### Task 3: Profile Presentation Rules

**Files:**
- Create: `apps/web/src/features/profile/profileAccess.ts`
- Create: `apps/web/src/features/profile/profileAccess.test.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`

**Interfaces:**
- Consumes: `currentAccess`, membership status and expiry.
- Produces: `shouldShowProfilePaymentAction`, localized access labels, duration/date copy, and masked email copy.

- [ ] **Step 1: Write failing helper tests**

Test active access with 4 days, exactly 3 days, less than 1 day, expired access, missing expiry and active recurrence. Test email masking and missing-email copy.

- [ ] **Step 2: Run helper tests and verify RED**

Run: `pnpm --filter @club/web test -- src/features/profile/profileAccess.test.ts`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Use exact threshold logic:

```ts
remainingMs <= 3 * 24 * 60 * 60 * 1000
```

Return `false` for active recurrent access and `true` for inactive access.

- [ ] **Step 4: Verify helper GREEN**

Run: `pnpm --filter @club/web test -- src/features/profile/profileAccess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/profile/profileAccess.ts apps/web/src/features/profile/profileAccess.test.ts apps/web/src/features/app/i18n.ts
git commit -m "feat: add profile access presentation rules"
```

### Task 4: Compact Responsive Card

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/profile/profileRoute.css`
- Modify: `apps/web/src/App.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: Task 3 presentation helpers and session `currentAccess`.
- Produces: compact responsive identity/access layout and conditional payment action.

- [ ] **Step 1: Write failing component/source assertions**

Assert a dedicated access-summary region, labelled email disclosure, avatar camera overlay, and conditional payment action are present. Assert the previous standalone camera action is absent.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- src/App.test.ts`
Expected: FAIL on the new structure assertions.

- [ ] **Step 3: Implement the Vue structure**

Render identity and access summary in a two-column top section, collapse safely at 320 px, keep the subscription status/progress in a full-width bottom row, and expose full email plus copy only after disclosure.

- [ ] **Step 4: Implement scoped mobile-first styling**

Use the existing semantic tokens, 8 px spacing rhythm, restrained border/shadow, 44 px actions, ellipsis only where the full value remains accessible, and bottom-nav-safe page padding.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `pnpm --filter @club/web test -- src/App.test.ts src/features/profile/profileAccess.test.ts`
Expected: PASS.

- [ ] **Step 6: Add Playwright behavior and layout assertions**

Cover 320×720 and 390×844 layouts, long product titles, gift/referral variants, hidden renewal at 4 days, visible renewal at 3 days, no overflow, and minimum control sizes.

- [ ] **Step 7: Run focused Playwright projects**

Run: `pnpm exec playwright test -g "profile access card" --project=android-compact-320 --project=viewport-390-844 --project=tablet-768-1024`
Expected: PASS with screenshots inspected.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/profile/ProfileSection.vue apps/web/src/features/profile/profileRoute.css apps/web/src/App.test.ts tests/e2e/app.spec.ts
git commit -m "feat: compact profile access card"
```

### Task 5: Full Verification, Visual Baselines, and Deployment

**Files:**
- Modify: `tests/e2e/app.spec.ts-snapshots/profile-*.png` only for intentionally changed profile baselines.

**Interfaces:**
- Consumes: completed feature commits.
- Produces: verified release commit deployed to the approved production target.

- [ ] **Step 1: Run repository verification**

Run: `pnpm check`
Run: `pnpm test`
Run: `pnpm build`
Expected: all exit 0.

- [ ] **Step 2: Run responsive and accessibility verification**

Run focused profile visual, overflow and accessibility tests at 320, 390, 768, 1024 and 1440 widths. Inspect light and dark screenshots before updating only intentional baselines.

- [ ] **Step 3: Commit verified baseline changes**

```bash
git add tests/e2e/app.spec.ts-snapshots
git commit -m "test: update profile access card baselines"
```

- [ ] **Step 4: Perform mandatory read-only production preflight**

Confirm public DNS/health/version for `club2.myn8nservertest.ru`, SSH target `2.27.28.89`, server directory `/opt/club-pwa`, repository remote, server commit, and local release commit. Stop on any mismatch.

- [ ] **Step 5: Push the exact verified commit**

Push the current main commit to the configured remote without force.

- [ ] **Step 6: Deploy the exact commit**

On `2.27.28.89`, run exactly:

```bash
DEPLOY_DIR=/opt/club-pwa bash /opt/club-pwa/deploy/update.sh
```

- [ ] **Step 7: Verify production**

Confirm public `/api/health`, `/api/ready`, application version, service worker, server `HEAD`, and deployed commit all refer to `club2.myn8nservertest.ru` and the same verified commit.

- [ ] **Step 8: Record rollback point**

Report the deployed commit. If rollback is requested later, create a new revert commit and redeploy it through the same preflight and verification path; do not rewrite production history.
