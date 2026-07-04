# Referral Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add referral links, accumulated bonus days, manual activation, admin referral history, project settings, and improve EN translations for touched profile/admin surfaces.

**Architecture:** Store referral relationships and rewards in dedicated Postgres tables, capture Telegram `start_param` during auth, award days from the Prodamus paid webhook once per invited user, and expose small focused API endpoints for profile and project settings. Keep UI changes inside existing Profile/Admin sections and reuse existing admin permission patterns.

**Tech Stack:** TypeScript, Hono, Drizzle ORM/Postgres, Vue 3, Pinia, Vitest, pnpm.

---

### Task 1: Shared Contracts And Permission

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/referrals.test.ts`

- [ ] Add failing tests for `project_settings`, referral profile schemas, admin referral schemas, and project settings schemas.
- [ ] Run `pnpm --filter @club/shared test -- referrals.test.ts`; expect failures because schemas do not exist.
- [ ] Add shared zod schemas and types for referral profile, referral activation, admin user referrals, project settings, and permission label.
- [ ] Run the targeted shared test until it passes.

### Task 2: Database Schema And Migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Add: `apps/api/drizzle/0030_referrals_project_settings.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/src/referrals/referrals.test.ts`

- [ ] Add failing unit tests for referral code normalization, activation eligibility, and reward-day parsing.
- [ ] Run `pnpm --filter @club/api test -- referrals/referrals.test.ts`; expect module-not-found failures.
- [ ] Add referral tables and relations in Drizzle schema.
- [ ] Add SQL migration for `referral_codes`, `referrals`, `referral_rewards`, and subscription provider length compatibility if needed.
- [ ] Add focused helper module under `apps/api/src/referrals`.
- [ ] Run targeted API referral tests until they pass.

### Task 3: Auth Capture And Profile API

**Files:**
- Modify: `apps/api/src/telegram/verifyInitData.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/routes/me.ts`
- Test: `apps/api/src/telegram/verifyInitData.test.ts`
- Test: `apps/api/src/referrals/profileRoute.test.ts`

- [ ] Add failing tests that Telegram initData exposes `start_param` and new users are linked to inviter once.
- [ ] Add failing tests for profile referral summary and activation guard.
- [ ] Implement start parameter parsing and referral capture during auth.
- [ ] Add `/me/referrals` and `/me/referrals/activate`.
- [ ] Send in-app and bot notifications when a new invited user is linked.
- [ ] Run targeted tests until they pass.

### Task 4: Payment Awarding

**Files:**
- Modify: `apps/api/src/routes/payments.ts`
- Test: `apps/api/src/payments/referralAward.test.ts`

- [ ] Add failing tests proving first successful payment awards bonus once and duplicate webhooks do not duplicate rewards.
- [ ] Implement referral award call after paid access is granted.
- [ ] Send in-app and bot notifications after paid referral reward.
- [ ] Run targeted payment tests until they pass.

### Task 5: Admin Project Settings And Client Detail

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/features/admin/adminPanels.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Test: `apps/web/src/features/admin/adminPanels.test.ts`
- Test: `apps/web/src/features/admin/adminClientCard.test.ts`

- [ ] Add failing tests for visible `project-settings` admin tab and client referral detail rendering.
- [ ] Add admin endpoints to read/update project settings.
- [ ] Include referral detail in admin user detail response.
- [ ] Add the "Настройки проекта" tab and field "Реферальное вознаграждение".
- [ ] Add referral history to the admin client card.
- [ ] Run targeted web/admin tests until they pass.

### Task 6: Profile UI And EN Translation Cleanup

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/features/profile/referralProfile.test.ts`
- Test: `apps/web/src/features/app/i18n.test.ts`

- [ ] Add failing tests for profile referral controls and English strings that were previously Russian in EN mode.
- [ ] Add client API functions for referral summary and activation.
- [ ] Add profile referral card with copy/share/activate controls.
- [ ] Move touched hardcoded profile strings into i18n and fill EN values.
- [ ] Run targeted web tests until they pass.

### Task 7: Version, Changelog, Full Verification, Deploy

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`

- [ ] Bump app version and add release note.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Commit implementation.
- [ ] Push and deploy to server.
- [ ] Verify deployed bundle contains the new version.

