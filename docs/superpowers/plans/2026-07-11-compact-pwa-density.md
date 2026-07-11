# Compact PWA Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the PWA's visual density by roughly 20–25% while preserving 44x44px minimum tap targets and the Samsung desktop-viewport compensation.

**Architecture:** Keep `apps/web/src/features/ui/foundation.css` as the canonical source for layout and control tokens. Update token contracts first, then add only compact component bridge rules for headers, navigation, profile cards, settings and chat. Preserve all stores, routes, API calls and business behavior.

**Tech Stack:** Vue 3, CSS custom properties, Vitest, Playwright, Vite PWA service worker.

## Global Constraints

- Do not use `transform: scale`, `zoom`, or global font shrinking.
- Keep every icon/button hit target at least `44x44px` in effective visual pixels.
- Keep mobile input font size at `16px`.
- Preserve all four semantic theme variants.
- Preserve the wide Samsung PWA compensation based on `--club-app-wide-viewport-scale`.
- Do not change API, routes, data, roles, payments, chat, uploads, manifest or service-worker behavior beyond cache versioning.

---

### Task 1: Compact foundation contract

**Files:**
- Modify: `apps/web/src/features/ui/foundation.test.ts`
- Modify: `apps/web/src/features/app/designSystem.test.ts`
- Modify: `apps/web/src/features/app/responsiveLayoutAudit.test.ts`

**Interfaces:**
- Consumes: CSS source strings.
- Produces: failing assertions for the compact semantic token contract.

- [ ] Change token assertions to require `--section-gap: 16px`, `--card-gap: 12px`, `--card-padding: 16px`, `--card-radius: 18px`, `--icon-size: 22px`, `--header-min-height: 68px`, `--bottom-nav-height: 68px`, and `--bottom-action-height: 64px`.
- [ ] Require scaled tokens to multiply `16/12/16/18/48/52/44/22/68/64px` by the full viewport compensation factor.
- [ ] Require PageHeader action wrapping at `max-width: 380px` and reject the old `480px` breakpoint.
- [ ] Run `pnpm --filter @club/web test -- src/features/ui/foundation.test.ts src/features/app/designSystem.test.ts src/features/app/responsiveLayoutAudit.test.ts` and confirm expected RED failures.

### Task 2: Foundation implementation

**Files:**
- Modify: `apps/web/src/features/ui/foundation.css`

**Interfaces:**
- Consumes: `--club-app-wide-viewport-scale` and existing semantic theme tokens.
- Produces: compact page/card/navigation/chat geometry with unchanged interactive behavior.

- [ ] Replace base and scaled density tokens with the approved values.
- [ ] Move PageHeader action wrapping breakpoint from `480px` to `380px`.
- [ ] Add final bridge rules for compact section headers, profile cards/settings, chat room gaps/bubbles/composer and bottom navigation.
- [ ] Keep `.ui-icon-button`, legacy icon bridges and chat actions at `var(--icon-button-size)` so effective tap size remains 44px.
- [ ] Run the focused Vitest command and confirm GREEN.

### Task 3: Visual regression and release

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: cache/version assertions as required.

**Interfaces:**
- Consumes: compact foundation build.
- Produces: deployable assets with a fresh PWA cache and verified route geometry.

- [ ] Run targeted Playwright screenshots at `320x720`, `390x844`, `768x1024`, including profile, chat, payment/settings and scaled Samsung projects.
- [ ] Confirm no horizontal overflow and no effective actionable target below 44px.
- [ ] Bump app version, release timestamp and service-worker cache name, updating corresponding tests first.
- [ ] Run `pnpm -r test`, `pnpm -r check`, `pnpm -r build`, and the relevant Playwright audit.
- [ ] Commit, push, deploy through the existing server script and verify production version, service-worker cache, HTTP 200 and `/api/health`.
