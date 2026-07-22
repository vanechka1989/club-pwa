# System Alert Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous owner infrastructure emails with clearly branded, Russian-language system notifications.

**Architecture:** Add a pure formatter beside the operational sender. The CLI sender passes formatter output to Nodemailer and continues using `OWNER_EMAIL` as its only recipient.

**Tech Stack:** TypeScript, Nodemailer, Vitest, Bun.

## Global Constraints

- Visible sender name is exactly `Club PWA • Системный монитор`.
- Subjects start with `[СИСТЕМА] Club PWA`.
- Messages state that club clients do not receive them.
- Event time is displayed in `Asia/Novosibirsk`.
- SMTP address and recipient configuration remain unchanged.

---

### Task 1: Pure operational alert formatter

**Files:**
- Create: `apps/api/src/operations/operationalAlertEmail.ts`
- Create: `apps/api/src/operations/operationalAlertEmail.test.ts`

**Interfaces:**
- Produces: `buildOperationalAlertEmail(input): { from, subject, text, html }`.
- Consumes: severity, raw detail, configured sender, and a deterministic timestamp.

- [ ] **Step 1: Write failing formatter tests**

Cover warning, critical backup failure, recovered status, unknown detail preservation, sender address extraction, and the client-exclusion notice.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm --filter @club/api test -- operationalAlertEmail.test.ts`

Expected: FAIL because `operationalAlertEmail.ts` does not exist.

- [ ] **Step 3: Implement the minimal formatter**

Return a Nodemailer-compatible sender object, system-prefixed subject, plain text, and escaped HTML. Translate these unit names: PostgreSQL backup, backup restore check, and Uptime Kuma backup.

- [ ] **Step 4: Verify formatter tests pass**

Run: `pnpm --filter @club/api test -- operationalAlertEmail.test.ts`

Expected: all formatter tests pass.

### Task 2: Connect formatter to SMTP command

**Files:**
- Modify: `apps/api/src/operations/sendOperationalAlert.ts`

**Interfaces:**
- Consumes: `buildOperationalAlertEmail` from Task 1.
- Preserves: `OWNER_EMAIL` as the only `to` address and existing transporter shutdown behavior.

- [ ] **Step 1: Replace inline subject/body construction**

Build the message with the formatter and spread it into `transporter.sendMail`, alongside `to: env.OWNER_EMAIL`.

- [ ] **Step 2: Run API checks**

Run: `pnpm --filter @club/api check && pnpm --filter @club/api test`

Expected: TypeScript check and all API tests pass.

- [ ] **Step 3: Run repository verification**

Run: `pnpm check && pnpm test && pnpm build`

Expected: all commands exit with code 0.

- [ ] **Step 4: Commit and deploy**

Commit the formatter, tests, sender integration, design, and plan. Push `main`, wait for the deployment workflow, and verify the exact deployed commit plus `/api/health` and `/api/ready`.
