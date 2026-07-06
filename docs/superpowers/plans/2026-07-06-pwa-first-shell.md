# PWA-first Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Club frontend shell so phone users see a real PWA app layout and desktop users see a clean dashboard layout.

**Architecture:** Keep the current Vue app, stores, APIs, and business components. Replace shell/navigation behavior, remove mobile zoom/collapse artifacts, split mobile primary navigation from desktop/admin navigation, and strengthen auth cooldown behavior with tests.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Testing Library Vue, Vite, Docker deploy.

---

### Task 1: Tests For PWA-first Navigation And Auth Behavior

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Test: `apps/web/src/App.test.ts`

- [ ] **Step 1: Add failing source-level tests**

Add tests asserting that mobile navigation excludes admin, the collapse toggle is gone, and mobile shell no longer uses scale-based typography.

```ts
it("keeps admin out of the mobile primary tab bar", () => {
  expect(appSource).toContain("mobileNavItems");
  expect(appSource).toContain("visibleMobileNavItems");
  expect(appSource).toContain("item.id !== \"admin\"");
  expect(appSource).toContain("mobile-admin-entry");
});

it("removes the collapsible mobile nav control from the PWA shell", () => {
  const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

  expect(appSource).not.toContain("navCollapsed");
  expect(appSource).not.toContain("toggleNavCollapsed");
  expect(appSource).not.toContain("bottom-nav-toggle");
  expect(styles).not.toContain(".bottom-nav-toggle");
  expect(styles).not.toContain(".bottom-nav-collapsed");
});

it("does not scale mobile device typography like a desktop viewport", () => {
  const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

  expect(appSource).not.toContain("--club-mobile-device-scale");
  expect(styles).not.toContain("--club-mobile-device-scale");
  expect(styles).not.toContain("font-size: calc(16px * var(--club-mobile-device-scale, 1));");
  expect(styles).toContain("body.club-mobile-device .app-root:not(.app-root-no-user) .app-shell");
});

it("keeps email resend disabled with a visible timer during cooldown", () => {
  const authSource = readFileSync(resolve(__dirname, "features/auth/AuthSection.vue"), "utf-8");

  expect(authSource).toContain(":disabled=\"!canResendCode\"");
  expect(authSource).toContain("resendRemainingSeconds.value > 0");
  expect(authSource).toContain("Отправить код ещё раз через");
  expect(authSource).not.toContain("Код отправлен на");
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
pnpm --filter @club/web test -- App.test.ts
```

Expected: fails because `mobileNavItems` / `visibleMobileNavItems` / removed collapse behavior are not implemented yet.

### Task 2: Shell Navigation Refactor

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/features/app/navigation.ts`
- Test: `apps/web/src/App.test.ts`

- [ ] **Step 1: Add mobile nav separation**

In `navigation.ts`, export mobile primary item IDs:

```ts
export const mobilePrimaryNavIds: AppSection[] = ["profile", "learning", "community", "payments", "support"];
```

In `App.vue`, import it and create:

```ts
const mobileNavItems = computed(() => navItems.filter((item) => mobilePrimaryNavIds.includes(item.id)));
const visibleMobileNavItems = computed(() => mobileNavItems.value.filter(isSectionAvailable));
const showMobileAdminEntry = computed(() =>
  Boolean(session.user && (session.user.realRole === "admin" || session.user.realRole === "owner"))
);
```

- [ ] **Step 2: Remove mobile nav collapse state**

Remove:

```ts
import { ChevronDown, ChevronUp } from "lucide-vue-next";
const navCollapsed = ref(false);
function toggleNavCollapsed() {
  blurActiveTextField();
  navCollapsed.value = !navCollapsed.value;
}
```

Remove the bottom nav toggle button and remove `:class="{ 'bottom-nav-collapsed': navCollapsed }"` from mobile nav.

- [ ] **Step 3: Render mobile nav and admin entry**

Use `visibleMobileNavItems` in the mobile bottom nav loop. Add a separate admin button inside the app shell/header area for admins:

```vue
<button
  v-if="showMobileAdminEntry"
  class="mobile-admin-entry"
  type="button"
  :aria-label="t('navAdmin')"
  @click="selectSection('admin')"
>
  <Shield class="h-4 w-4" aria-hidden="true" />
  <span>{{ t("navAdmin") }}</span>
</button>
```

- [ ] **Step 4: Run tests and verify green for navigation**

Run:

```bash
pnpm --filter @club/web test -- App.test.ts
```

Expected: navigation tests pass or only style tests fail until Task 3.

### Task 3: Mobile App Layout CSS

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.ts`

- [ ] **Step 1: Remove scale-based mobile shell CSS**

Delete or replace the block:

```css
html.club-mobile-device {
  font-size: calc(16px * var(--club-mobile-device-scale, 1));
}
```

Keep the `club-mobile-device` class, but use it only for app layout switching.

- [ ] **Step 2: Make mobile content full-screen app layout**

Add/adjust CSS so mobile installed app uses:

```css
body.club-mobile-device .app-root:not(.app-root-no-user) .app-shell {
  width: 100%;
  max-width: none;
  min-height: var(--club-viewport-height, 100dvh);
  padding: max(0.75rem, var(--club-safe-top)) 0 calc(5.75rem + var(--club-safe-bottom));
}

body.club-mobile-device .app-root:not(.app-root-no-user) .content-panel {
  width: 100%;
  max-width: none;
  min-height: auto;
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 0.75rem;
}
```

- [ ] **Step 3: Make bottom navigation stable and touch-friendly**

Ensure mobile bottom nav:

```css
.bottom-nav {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.bottom-nav-item {
  min-height: 3rem;
  touch-action: manipulation;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @club/web test -- App.test.ts
```

Expected: App shell source/style tests pass.

### Task 4: Auth Copy And Cooldown Verification

**Files:**
- Modify: `apps/web/src/features/auth/AuthSection.vue`
- Test: `apps/web/src/App.test.ts`

- [ ] **Step 1: Verify code-entry copy and resend button**

Keep code entry copy:

```vue
<h2 id="auth-title">{{ isCodeStep ? "Код из письма" : "Вход в клуб" }}</h2>
<p>{{ isCodeStep ? "Введите 6 цифр из письма." : "Введите email, на который открыть доступ." }}</p>
```

Keep resend button disabled during cooldown:

```vue
<button class="secondary-button" type="button" :disabled="!canResendCode" @click="resendCode">
  {{ resendButtonLabel }}
</button>
```

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm --filter @club/web test -- App.test.ts
```

Expected: auth tests pass.

### Task 5: Full Verification And Deploy

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/features/app/navigation.ts`
- Modify: `apps/web/src/features/auth/AuthSection.vue`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Run full web test suite**

Run:

```bash
pnpm --filter @club/web test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm --filter @club/web build
```

Expected: build succeeds. Existing chunk-size warnings are acceptable.

- [ ] **Step 3: Visual smoke checks**

Check:

- Browser route `/` shows install gate only.
- Installed route `/?source=pwa` shows auth.
- Mobile viewport around 390x850 has normal-sized UI, no horizontal scroll, and 5 bottom tabs max.
- Desktop viewport around 1440x900 uses sidebar/dashboard layout.

- [ ] **Step 4: Commit, merge to main, push, deploy**

Run:

```bash
git add docs/superpowers/plans/2026-07-06-pwa-first-shell.md apps/web/src/App.test.ts apps/web/src/App.vue apps/web/src/features/app/navigation.ts apps/web/src/features/auth/AuthSection.vue apps/web/src/styles.css
git commit -m "Rework PWA shell for app-first layout"
git switch main
git merge --ff-only codex/pwa-first-shell
git push origin main
ssh -i C:/Users/ivan/.ssh/club_pwa_codex_ed25519 root@2.27.28.89 "cd /opt/club-pwa && bash deploy/update.sh"
```

Expected: commit succeeds, `main` pushes to GitHub, deploy script rebuilds services, migrations run, and health check passes.
