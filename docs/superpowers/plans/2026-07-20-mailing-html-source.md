# Mailing HTML Source Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe HTML-source editing mode whose formatted output reaches email and the in-app notification center while native PWA push receives readable plain text.

**Architecture:** Keep the API sanitizer as the trust boundary and align the browser sanitizer with its allowlist. Add a small pure editor-state module so source/visual conversion and preview can be tested independently of the large admin component, then wire it into the existing mailing form.

**Tech Stack:** Vue 3, TypeScript, Hono, `sanitize-html`, Vitest, existing PWA web-push pipeline.

## Global Constraints

- Allowed tags are exactly `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `code`, `ul`, `ol`, `li`, `a`, `blockquote`, `h2`, `h3`.
- Server-side sanitization remains authoritative.
- Native PWA push payloads contain no HTML tags.
- Switching modes must not lose supported markup.
- No database migration or new dependency is required.

---

### Task 1: Align safe HTML and text fallback

**Files:**
- Modify: `apps/api/src/mailings/html.ts`
- Modify: `apps/api/src/mailings/html.test.ts`
- Modify: `apps/web/src/utils/sanitizeHtml.ts`
- Modify: `apps/web/src/utils/sanitizeHtml.test.ts`

**Interfaces:**
- Consumes: existing `sanitizeMailingHtml(value: string)` and `sanitizeHtml(value: string)`.
- Produces: both sanitizers preserve the agreed allowlist, including `<code>`, headings and blockquotes; `htmlToMailingText(value: string)` returns readable tag-free text.

- [ ] **Step 1: Write failing sanitizer tests**

Add assertions that `<b>`, `<i>`, `<code>`, `<blockquote>`, `<h2>` and `<h3>` survive; `<script>`, inline handlers and `javascript:` links do not; the supplied subscription report becomes plain text containing its line breaks and no angle-bracket tags.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @club/api test -- src/mailings/html.test.ts && pnpm --filter @club/web test -- src/utils/sanitizeHtml.test.ts`

Expected: at least the `<code>` preservation assertions fail.

- [ ] **Step 3: Implement the shared allowlist behavior**

Add `code` to the API allowlist. Replace the browser's broader `DIV`/`SPAN` list with the exact agreed tags and allow `mailto:` alongside `http:`/`https:`. Continue rebuilding every element and every link attribute rather than trusting stored HTML.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command.

Expected: all focused sanitizer tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mailings/html.ts apps/api/src/mailings/html.test.ts apps/web/src/utils/sanitizeHtml.ts apps/web/src/utils/sanitizeHtml.test.ts
git commit -m "feat(mailings): support safe inline code formatting"
```

### Task 2: Add testable HTML editor state conversion

**Files:**
- Create: `apps/web/src/features/admin/mailingEditorMode.ts`
- Create: `apps/web/src/features/admin/mailingEditorMode.test.ts`

**Interfaces:**
- Produces: `type MailingEditorMode = "visual" | "html"`.
- Produces: `prepareMailingHtml(value: string): { safeHtml: string; plainText: string }` using the browser sanitizer and DOM text extraction with block/line-break preservation.

- [ ] **Step 1: Write failing conversion tests**

Cover the supplied `<b>`/`<code>` report, unsafe script removal, readable newlines, and an empty-after-sanitization input.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @club/web test -- src/features/admin/mailingEditorMode.test.ts`

Expected: FAIL because `mailingEditorMode.ts` does not exist.

- [ ] **Step 3: Implement minimal conversion module**

Sanitize first, replace `br`, closing block tags and list items with newline boundaries in a detached DOM, then return normalized plain text without three or more consecutive newlines. Never execute or mount input HTML.

- [ ] **Step 4: Run focused test**

Run the Step 2 command.

Expected: all editor conversion tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/admin/mailingEditorMode.ts apps/web/src/features/admin/mailingEditorMode.test.ts
git commit -m "feat(mailings): add HTML editor state conversion"
```

### Task 3: Wire source mode and safe preview into the admin composer

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/admin/adminMailings.test.ts`
- Modify: `apps/web/src/features/admin/adminMailingChannelsLayout.test.ts`

**Interfaces:**
- Consumes: `MailingEditorMode` and `prepareMailingHtml` from Task 2.
- Produces: a two-button `Визуально` / `HTML-код` control, source textarea, sanitized preview, and correct form data in either mode.

- [ ] **Step 1: Write failing component/layout tests**

Assert that the composer imports `prepareMailingHtml`, exposes both mode labels, conditionally renders `contenteditable` and a source textarea, renders preview only with sanitized HTML, and calls a mode-aware synchronization method before test-send/create.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --filter @club/web test -- src/features/admin/adminMailings.test.ts src/features/admin/adminMailingChannelsLayout.test.ts`

Expected: assertions for the HTML source controls fail.

- [ ] **Step 3: Implement source-mode state and switching**

Add `mailingEditorMode`, compute `{ safeHtml, plainText }`, copy visual editor HTML before entering source mode, sanitize source before returning to visual mode, and update `mailingBody` from the derived plain text. Ensure reset/reuse/open flows initialize the mode and editor consistently.

- [ ] **Step 4: Implement template and styles**

Show the existing toolbar/editor in visual mode, a monospaced multiline textarea in HTML mode, and a `Предпросмотр сообщения` block using `v-html` only with `safeHtml`. Keep controls mobile-friendly and reuse existing button/input tokens.

- [ ] **Step 5: Make submit/test-send mode-aware**

Before building `FormData`, synchronize the active mode. Send the source HTML as `bodyHtml` and the derived text as `body`; disable submission only when title or derived plain text is empty.

- [ ] **Step 6: Run focused tests**

Run the Step 2 command plus `pnpm --filter @club/web test -- src/features/admin/mailingEditorMode.test.ts src/utils/sanitizeHtml.test.ts`.

Expected: all focused web tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/admin/AdminSection.vue apps/web/src/styles.css apps/web/src/features/admin/adminMailings.test.ts apps/web/src/features/admin/adminMailingChannelsLayout.test.ts
git commit -m "feat(mailings): add HTML source editor mode"
```

### Task 4: Verify channel behavior and release

**Files:**
- Modify: `apps/api/src/routes/mailings.ts`
- Modify: `apps/api/src/push/webPush.test.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`
- Modify corresponding release tests.

**Interfaces:**
- Consumes: sanitized `bodyHtml` and derived `body` already passed to `createAppNotification`.
- Produces: formatted email/in-app content, tag-free native push content, and the next application release.

- [ ] **Step 1: Add channel regression assertions**

Assert that mailing delivery passes `bodyHtml` to the in-app notification, passes only `body` to web-push, and that `buildWebPushPayload` never receives the HTML source. Prefer behavior tests where existing seams allow them; otherwise use the repository's source-contract test pattern.

- [ ] **Step 2: Run focused API tests**

Run: `pnpm --filter @club/api test -- src/mailings/html.test.ts src/push/webPush.test.ts`

Expected: all channel assertions pass after any minimal route correction.

- [ ] **Step 3: Bump release metadata**

Increment the application version and service-worker cache, add a Russian release note describing HTML source mode and plain-text system push, and update their exact-value tests.

- [ ] **Step 4: Run full verification**

Run: `pnpm test`, `pnpm build`, and `git diff --check`.

Expected: all tests pass, production build succeeds, and diff check is empty.

- [ ] **Step 5: Commit release**

```bash
git add apps/api apps/web packages/shared
git commit -m "release: publish HTML formatted mailings"
```

### Task 5: Integrate and deploy

**Files:** No source changes expected.

- [ ] **Step 1: Fast-forward `main` and rerun tests on the merged tree**

Run: `git merge --ff-only <feature-branch> && pnpm test && pnpm build`.

Expected: merge and verification succeed.

- [ ] **Step 2: Push and deploy**

Run: `git push origin main`, then use the repository's production deployment script on `/opt/club-pwa`.

Expected: deployment status is `success` for the pushed commit.

- [ ] **Step 3: Verify production**

Confirm `/api/health` returns `{ "ok": true }`, API is healthy, the public service worker contains the new cache id, and the deployed JavaScript contains the new application version and release note.
