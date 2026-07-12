# Tariff Title Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give tariff titles the full left column by moving optional badges beside tariff metadata.

**Architecture:** Keep the existing payment card grid and API unchanged. Adjust only the Vue markup and scoped global classes, then bump the PWA release version and cache.

**Tech Stack:** Vue 3, CSS, Vitest, pnpm workspace.

## Global Constraints

- Preserve the 80 px payment button and 44 px tap height.
- Do not change payment business logic or API contracts.
- Keep long titles on one line with an ellipsis only at the card boundary.

---

### Task 1: Move tariff badge below the title

**Files:**
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/billing/paymentProviderStyle.test.ts`

- [ ] Add a failing source-layout test for a metadata row containing both period text and the optional badge.
- [ ] Run the focused test and confirm it fails because the badge is still in the heading.
- [ ] Move the badge into a new `payment-product-details` row and make the title heading full width.
- [ ] Run focused tests and confirm they pass.

### Task 2: Release and verify

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] Set application version to 3.80 and service-worker cache to v81.
- [ ] Run all tests, type checks, build, and `git diff --check`.
- [ ] Commit, push `main`, wait for VPS deployment, and verify production assets and server commit.
