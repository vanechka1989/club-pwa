# Email Code Spam Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calm, visible spam-folder reminder to the email-code step without changing authentication behavior.

**Architecture:** Render one informational row inside the existing code form, style it with current semantic tokens, and translate it through the existing DOM localization map. Keep the change isolated to the auth UI, localization, tests, and release metadata.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library Vue, CSS, Vite PWA.

## Global Constraints

- Show the hint only on the six-digit code step.
- Russian copy: `Письмо не пришло? Проверьте папку «Спам».`
- English copy: `Didn’t receive the email? Check your Spam folder.`
- Use existing semantic theme variables and no warning/error colors.
- Keep the layout free of horizontal overflow at 320 px.
- Do not change authentication requests, resend timing, or verification behavior.

---

### Task 1: Spam hint behavior and presentation

**Files:**
- Modify: `apps/web/src/features/auth/authEmail.test.ts`
- Modify: `apps/web/src/features/auth/AuthSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/interfaceLocalization.ts`

**Interfaces:**
- Consumes: existing `isCodeStep` branch in `AuthSection.vue` and `englishPhrases` localization map.
- Produces: `.auth-spam-hint` informational row rendered only in the code form.

- [ ] **Step 1: Write the failing component test**

Add a test that confirms the hint is absent on the email form, requests a code, and then expects `Письмо не пришло? Проверьте папку «Спам».` to appear.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @club/web test -- authEmail.test.ts`

Expected: FAIL because the spam hint is not rendered.

- [ ] **Step 3: Implement the minimal UI and localization**

Add a `MailWarning` icon and an informational row directly after the code input label. Add the exact English phrase mapping. Style the row as a compact flex row using `var(--panel-soft)`, `var(--accent)`, `var(--text)`, and `var(--border)` with `min-width: 0` and wrapping copy.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/web test -- authEmail.test.ts interfaceLocalization.test.ts`

Expected: PASS.

### Task 2: Release metadata, verification, and deployment

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: existing sequential version and cache conventions.
- Produces: application version `4.50` and service-worker cache `club-pwa-v149`.

- [ ] **Step 1: Update release tests first**

Change expectations to version `4.50`, title `Подсказка о письме`, previous version `4.49`, and cache `club-pwa-v149`.

- [ ] **Step 2: Run release tests and verify RED**

Run: `pnpm --filter @club/web test -- releaseNotes.test.ts pwa.test.ts`

Expected: FAIL on old version/cache values.

- [ ] **Step 3: Update version, release notes, and cache**

Publish the spam-folder hint in Russian and English release notes and bump the service-worker cache.

- [ ] **Step 4: Verify and deploy**

Run `pnpm test`, `pnpm build`, and `git diff --check`; commit, push `main`, run `/opt/club-pwa/deploy/update.sh`, then verify `/api/health`, server commit, version `4.50`, release title, cache `v149`, and clean worktree.
