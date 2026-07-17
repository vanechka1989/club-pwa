# Branded Login Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отправлять код входа одновременно в надёжной текстовой версии и в фирменном HTML-письме Club с логотипом, крупным кодом и безопасной кнопкой перехода в приложение.

**Architecture:** `buildEmailLoginMessage` остаётся единственным построителем login-письма и получает публичный `WEB_ORIGIN`. Функция валидирует шестизначный код, формирует text fallback и совместимый табличный HTML с inline-стилями; существующий Nodemailer transport отправляет оба MIME-варианта без новых зависимостей.

**Tech Stack:** TypeScript, Node URL API, Nodemailer, Vitest, pnpm.

## Global Constraints

- SMTP, база данных, срок действия кода и ограничение попыток не меняются.
- Код и email не добавляются в URL.
- HTML не содержит JavaScript, форм, трекеров или Clipboard API.
- Текстовый fallback остаётся обязательным.
- Внешний ресурс письма — только существующая иконка `${WEB_ORIGIN}/icons/icon-192.png`.

---

### Task 1: Login email builder

**Files:**
- Modify: `apps/api/src/auth/emailAuth.test.ts`
- Modify: `apps/api/src/auth/emailAuth.ts`

**Interfaces:**
- Consumes: `{ code: string; expiresInMinutes: number; webOrigin: string }`.
- Produces: `buildEmailLoginMessage(input): { subject: string; text: string; html: string }`.

- [ ] **Step 1: Write failing HTML email tests**

Extend the existing message test with:

```ts
const message = buildEmailLoginMessage({
  code: "073567",
  expiresInMinutes: 10,
  webOrigin: "https://club2.myn8nservertest.ru"
});

expect(message.text).toContain("073567");
expect(message.html).toContain("073 567");
expect(message.html).toContain("https://club2.myn8nservertest.ru/icons/icon-192.png");
expect(message.html).toContain('href="https://club2.myn8nservertest.ru"');
expect(message.html).toContain("Нажмите и удерживайте код");
expect(message.html).not.toContain("073567?");
expect(message.html).not.toMatch(/<script|onclick=|clipboard/i);
```

Add validation assertions:

```ts
expect(() =>
  buildEmailLoginMessage({ code: "12345x", expiresInMinutes: 10, webOrigin: "https://club.example" })
).toThrow("six digits");
expect(() =>
  buildEmailLoginMessage({ code: "123456", expiresInMinutes: 10, webOrigin: "javascript:alert(1)" })
).toThrow("http or https");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @club/api test -- src/auth/emailAuth.test.ts
```

Expected: FAIL because the builder does not accept `webOrigin` and does not return `html`.

- [ ] **Step 3: Implement validation and HTML generation**

In `emailAuth.ts`, add private helpers that:

```ts
function normalizePublicWebOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Email web origin must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
```

Validate `code` with `/^\d{6}$/`, format it as `${code.slice(0, 3)} ${code.slice(3)}`, and return a complete table-based HTML document. Use inline styles, a 560 px maximum card width, a 56 px logo, a large monospace code block, a plain anchor button to `webOrigin`, and a security notice containing `expiresInMinutes`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @club/api test -- src/auth/emailAuth.test.ts
```

Expected: all email auth tests PASS.

---

### Task 2: Wire the production origin

**Files:**
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/auth/emailAuth.test.ts`

**Interfaces:**
- Consumes: `env.WEB_ORIGIN` validated by `apps/api/src/env.ts`.
- Produces: every `/auth/email/start` email contains the HTML variant built for the current public application origin.

- [ ] **Step 1: Add a route wiring regression assertion**

Read `routes/auth.ts` in the test and assert that the message builder receives:

```ts
expect(authRouteSource).toContain("webOrigin: env.WEB_ORIGIN");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @club/api test -- src/auth/emailAuth.test.ts
```

Expected: FAIL because `auth.ts` does not pass `webOrigin`.

- [ ] **Step 3: Pass WEB_ORIGIN to the builder**

Change the route call to:

```ts
const message = buildEmailLoginMessage({
  code,
  expiresInMinutes: env.AUTH_LOGIN_CODE_TTL_MINUTES,
  webOrigin: env.WEB_ORIGIN
});
```

- [ ] **Step 4: Run focused tests and API check**

Run:

```bash
pnpm --filter @club/api test -- src/auth/emailAuth.test.ts src/auth/emailDelivery.test.ts
pnpm --filter @club/api check
```

Expected: tests and TypeScript check PASS.

---

### Task 3: Release metadata and complete verification

**Files:**
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: application version `4.67` and Service Worker cache `club-pwa-v166`.

- [ ] **Step 1: Update release tests first**

Expect version `4.67`, a current Russian release titled `Красивые письма с кодом входа`, and cache `club-pwa-v166`.

- [ ] **Step 2: Run release tests and verify RED**

Run:

```bash
pnpm --filter @club/web test -- src/features/app/releaseNotes.test.ts src/features/app/pwa.test.ts
```

Expected: FAIL on the previous `4.66` and `v165` values.

- [ ] **Step 3: Publish release metadata**

Set version `4.67`, the actual Asia/Novosibirsk completion timestamp, cache `club-pwa-v166`, and bilingual release notes describing the branded HTML login message and retained text fallback.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm --filter @club/api test
pnpm --filter @club/api check
pnpm --filter @club/api build
pnpm --filter @club/web test
pnpm --filter @club/web check
pnpm --filter @club/web build
git diff --check
```

Expected: every command exits 0 with no failed tests.

- [ ] **Step 5: Commit, push, deploy, and verify production**

Commit implementation, push `main`, run `/opt/club-pwa/deploy/update.sh`, then verify:

```text
/api/health -> {"ok":true}
production commit == local commit
public JS contains 4.67
/sw.js contains club-pwa-v166
```

Use a generated non-production fixture to inspect the final HTML structure; do not log or expose a live user code.
