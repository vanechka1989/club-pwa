# Push And Email Mailings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить неиспользуемую Telegram-логику рассылок на работающие каналы push, email и push + email с корректным расчётом, независимым учётом доставок и компактным мобильным интерфейсом.

**Architecture:** Shared-схемы задают новые каналы и расширенный preview. API строит канал-зависимые доставки, сохраняет одну строку на пользователя и канал и независимо отправляет push/email. Email использует общий SMTP transport и подписанную публичную отписку; Vue отображает три канала и фактические показатели очереди.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle ORM/PostgreSQL, Nodemailer, Vitest, Vite, PWA web push.

## Global Constraints

- Telegram не участвует в новых рассылках и расчётах.
- Push означает колокольчик приложения плюс PWA push.
- Каналы: `push`, `email`, `push_email`.
- Старые `app`, `bot`, `all` читаются как `push`.
- Email-отписка не влияет на транзакционные письма авторизации.
- Новая версия приложения: `4.08`; service worker cache: `club-pwa-v109`.

---

### Task 1: Shared contracts and delivery planning

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/mailings/channels.ts`
- Create: `apps/api/src/mailings/channels.test.ts`
- Modify: `apps/api/src/mailings/estimate.ts`
- Modify: `apps/api/src/mailings/estimate.test.ts`

**Interfaces:**
- Produces: `MailingChannel = "push" | "email" | "push_email"`, `normalizeMailingChannel`, `getMailingDeliveryChannels`, `estimateMailingDurationSeconds({ pushCount, emailCount })`.

- [ ] Write failing tests proving legacy values normalize to push, combined expands to two deliveries, 1248 push recipients estimate 315 seconds, 1248 email recipients estimate 624 seconds, and combined estimates add.
- [ ] Run `pnpm --filter @club/api test -- channels.test.ts estimate.test.ts`; expect failures against the Telegram estimator.
- [ ] Implement channel helpers, new shared schemas and expanded preview fields: `targetCount`, `deliveryCount`, `pushCount`, `pushSubscriptionCount`, `emailCount`, `excludedMissingEmail`, `excludedEmailOptOut`, `excludedByFilters`, `estimatedSeconds`, `estimatedLabel`.
- [ ] Re-run focused tests and expect PASS.

### Task 2: Database migration and channel-aware audience

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0040_push_email_mailings.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/mailings/audience.ts`
- Modify: `apps/api/src/mailings/audience.test.ts`
- Create: `apps/api/src/db/pushEmailMailingsSchema.test.ts`

**Interfaces:**
- Consumes: new mailing channels.
- Produces: `users.marketingEmailOptOutAt`, `admin_mailings.delivery_count`, `admin_mailing_recipients.channel`, unique `(mailing_id,user_id,channel)`, audience eligibility independent of Telegram status.

- [ ] Write failing tests for email presence/opt-out and migration structure.
- [ ] Run focused tests and confirm RED.
- [ ] Add schema fields and migration that maps legacy channels to `push`, sets existing recipient channel to `push`, and creates the unique delivery index.
- [ ] Refactor audience filtering so common filters run once; Telegram bot status is ignored; email exclusions are counted only for email-capable modes.
- [ ] Run focused tests and expect PASS.

### Task 3: Reusable SMTP delivery and unsubscribe tokens

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `.env.example`
- Modify: `docker-compose.prod.yml`
- Modify: `apps/api/src/auth/emailDelivery.ts`
- Modify: `apps/api/src/auth/emailDelivery.test.ts`
- Create: `apps/api/src/mailings/unsubscribe.ts`
- Create: `apps/api/src/mailings/unsubscribe.test.ts`

**Interfaces:**
- Produces: reusable `sendEmail({to,subject,text,html?,headers?})`, `createMailingUnsubscribeToken(userId)`, `verifyMailingUnsubscribeToken(token)`.

- [ ] Write failing tests for HTML/headers, single transport factory, signed token verification and tamper rejection.
- [ ] Run focused tests and confirm RED.
- [ ] Add `MAILING_UNSUBSCRIBE_SECRET`, cached Nodemailer transport, optional HTML/headers, and HMAC token helpers using SHA-256 with timing-safe comparison.
- [ ] Run focused tests and expect PASS.

### Task 4: Preview, creation and queue delivery

**Files:**
- Modify: `apps/api/src/routes/mailings.ts`
- Modify: `apps/api/src/mailings/serialize.ts`
- Modify: `apps/api/src/notifications/create.ts`
- Create: `apps/api/src/mailings/pushEmailQueue.test.ts`
- Modify: `apps/api/src/mailings/estimate.test.ts`

**Interfaces:**
- Consumes: delivery channels, new schema, email sender, unsubscribe tokens.
- Produces: one delivery row per actual channel; independent push/email status; accurate preview and serialized counts.

- [ ] Write failing source/integration tests asserting preview ignores Telegram status, create inserts per-channel rows, email delivery has unsubscribe link/headers, and completed status waits for all deliveries.
- [ ] Run focused tests and confirm RED.
- [ ] Refactor preview to count filtered users, active push subscriptions and eligible emails; create deliveries with `onConflictDoNothing`; dispatch based on recipient channel; update delivery counters and completion.
- [ ] Make test-draft honor the selected channel and report sent/skipped channels.
- [ ] Run focused API tests and expect PASS.

### Task 5: Public email unsubscribe endpoint

**Files:**
- Create: `apps/api/src/routes/mailingPreferences.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/mailings/unsubscribeRoute.test.ts`

**Interfaces:**
- Consumes: verified unsubscribe token.
- Produces: `GET /mailings/unsubscribe?token=...` HTML confirmation and idempotent opt-out update.

- [ ] Write failing route/source tests for valid, invalid and repeated unsubscribe behavior.
- [ ] Run focused tests and confirm RED.
- [ ] Implement the public route with escaped static HTML, no authentication middleware and update only `marketingEmailOptOutAt`.
- [ ] Run focused tests and expect PASS.

### Task 6: Mailing UI and visual fixes

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/admin/adminMailings.test.ts`
- Create: `apps/web/src/features/admin/adminMailingChannelsLayout.test.ts`

**Interfaces:**
- Consumes: expanded preview and channels.
- Produces: centered primary action, icon-only reset, three channel selectors and detailed calculation cards.

- [ ] Write failing tests for three channel labels, default/reset `push`, reset icon accessible name, centered header action and all preview metrics.
- [ ] Run focused web tests and confirm RED.
- [ ] Update client types, Vue state/markup and isolated CSS. Use `RotateCcw` at 44×44 px; keep submit/test buttons unchanged.
- [ ] Run focused tests and expect PASS.

### Task 7: Release, verification and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: version `4.08`, cache `club-pwa-v109`, deployed migration and production assets.

- [ ] Update release tests first and confirm RED against `4.07`/`v108`.
- [ ] Update version, timestamp, release note and service worker cache.
- [ ] Run all tests, `pnpm check`, `pnpm build`, and `git diff --check`.
- [ ] Add `MAILING_UNSUBSCRIBE_SECRET` to production `.env` without printing it, commit, push `main`, deploy with `DEPLOY_FORCE=1 bash deploy/update.sh`.
- [ ] Verify server commit, database migration, `/api/health`, `v109`, version `4.08`, new production CSS selectors and public unsubscribe rejection for an invalid token.

## Self-review

- All design requirements map to tasks 1–7; attachment delivery is explicitly a link in email rather than a binary attachment.
- No placeholder steps or undefined channel names remain.
- `push`, `email`, `push_email` are consistent across shared, API, database and UI layers.

