# Payment and Support Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize payment CTAs and redesign the admin support overview and ticket list as compact modern surfaces.

**Architecture:** Keep all business logic in the existing Vue components. Change only presentation copy, support markup, and route-owned CSS, with Playwright assertions covering the rendered behavior and geometry.

**Tech Stack:** Vue 3, TypeScript, CSS, Lucide icons, Vitest, Playwright.

## Global Constraints

- All tariff CTA labels are `Оплатить`; loading remains `Открываем…`.
- Payment and support API behavior does not change.
- Support metrics use one parent surface, not nested cards.
- Ticket cards use 8 px radius and remain 76–96 px tall on mobile fixtures.
- Release version is 5.67 and service-worker cache is `club-pwa-v239`.

---

### Task 1: Unified payment action label

**Files:**
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Preserves: `handleCheckout(product)` and every checkout branch.
- Produces: the same `Оплатить` label for one-time and recurrent products.

- [ ] **Step 1: Add a recurrent payment fixture and failing E2E assertion**

Add a published recurrent product to `/payments/plans`, then assert that all tariff action buttons are named `Оплатить` and no `Оформить подписку` action exists.

- [ ] **Step 2: Run the targeted release browser test**

Run `pnpm exec playwright test -c playwright.release.config.ts -g "keeps core sections inside the mobile viewport" --project=release-android` and confirm failure on the recurrent CTA.

- [ ] **Step 3: Use the common payment label**

Replace the recurrent/one-time label branch with `t("paymentsPay")`; keep the loading branch and click handler unchanged.

- [ ] **Step 4: Re-run the targeted browser test**

Run the same Playwright command and confirm it passes.

- [ ] **Step 5: Commit**

Commit with `fix: unify tariff payment actions`.

### Task 2: Modern support overview and ticket cards

**Files:**
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/support/supportRoute.css`
- Modify: `apps/web/src/features/support/supportSection.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: existing `ticketStats`, `averageResponseTimeLabel`, `statusTone`, and `getSupportTicketDisplayState`.
- Produces: `.support-stat`, `.support-stat-icon`, `.support-admin-ticket-header`, and `.support-admin-ticket-chevron` presentation hooks.

- [ ] **Step 1: Add failing layout and browser assertions**

Assert a single overview surface with four metric cells, 2×2 mobile columns, compact 8 px ticket cards, visible borders/backgrounds, state accents, and a chevron. Keep the existing ticket button semantics.

- [ ] **Step 2: Run focused tests and Android E2E**

Run `pnpm --filter @club/web test -- src/features/support/supportSection.test.ts` and the targeted Android release test; confirm failures describe the old pills and bare rows.

- [ ] **Step 3: Update support markup**

Use `Inbox`, `MessagesSquare`, `CheckCircle2`, `Clock3`, and `ChevronRight`; move status into the ticket header and add `data-state` to each ticket button.

- [ ] **Step 4: Add authoritative route styles**

Append theme-token-based rules for the unified stats surface and compact ticket cards, including narrow-mobile and 620 px layout rules.

- [ ] **Step 5: Re-run focused tests and E2E**

Confirm unit and Android browser assertions pass, inspect screenshots, and adjust only if visible defects remain.

- [ ] **Step 6: Commit**

Commit with `fix: polish admin support overview`.

### Task 3: Release and deployment

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: version `5.67` and cache `club-pwa-v239`.

- [ ] **Step 1: Add failing release assertions**

Expect version 5.67, the new release title, retained 5.66 history, and cache v239.

- [ ] **Step 2: Update release metadata**

Describe the unified payment label, support overview, and compact ticket cards in Russian and English release copy.

- [ ] **Step 3: Run full verification**

Run `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:release`.

- [ ] **Step 4: Merge, push, and verify production**

Fast-forward `main`, rerun the full test suite, push, wait for CI/deploy, then verify HTTP health, commit marker, container health, production assets, and service-worker v239.
