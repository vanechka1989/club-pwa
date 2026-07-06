# Responsive PWA Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an adaptive PWA shell where phones keep the bottom navigation and desktop browsers get a persistent left sidebar with a wider content workspace.

**Architecture:** Keep the existing section state and `selectSection` flow in `App.vue`. Add a second navigation surface for desktop, then use CSS media queries to show the desktop sidebar at `1024px+` and keep the current bottom nav below that breakpoint.

**Tech Stack:** Vue 3 Composition API, Pinia stores, Lucide Vue icons, CSS/Tailwind utility mix, Vitest, Playwright for visual checks.

---

### Task 1: Lock Responsive Shell Expectations

**Files:**
- Modify: `apps/web/src/App.test.ts`

- [ ] **Step 1: Write the failing test**

Add a source-level test near the existing app shell tests:

```ts
it("defines separate mobile bottom navigation and desktop sidebar surfaces", () => {
  const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

  expect(appSource).toContain("desktop-sidebar");
  expect(appSource).toContain("desktop-sidebar-nav");
  expect(appSource).toContain("mobile-bottom-nav");
  expect(appSource).toContain("desktop-sidebar-user");
  expect(appSource).toContain("visibleNavItems");
  expect(styles).toContain("@media (min-width: 1024px)");
  expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.desktop-sidebar\s*{[\s\S]*display: flex;/);
  expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.mobile-bottom-nav\s*{[\s\S]*display: none;/);
  expect(styles).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.desktop-sidebar\s*{[\s\S]*display: none;/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @club/web exec vitest run src/App.test.ts`

Expected: FAIL because `desktop-sidebar` and the desktop media rules do not exist yet.

### Task 2: Add Desktop Sidebar Markup

**Files:**
- Modify: `apps/web/src/App.vue`

- [ ] **Step 1: Add computed display helpers**

Add helpers after `visibleNavItems`:

```ts
const userDisplayName = computed(() => session.user?.firstName || session.user?.username || session.user?.email || t("profileDefaultName"));
const userEmail = computed(() => session.user?.email || session.user?.username || session.user?.telegramId || "");
const userInitial = computed(() => userDisplayName.value.trim().slice(0, 1).toUpperCase() || "C");
const membershipLabel = computed(() => {
  if (!session.user) {
    return "";
  }
  return session.user.membershipStatus === "active" ? t("profileAccessActive") : t("profileSubscriptionInactive");
});
```

- [ ] **Step 2: Wrap content in the adaptive shell**

Replace the single `section.app-shell` area with an `app-layout` wrapper that contains:

```vue
<div class="app-layout">
  <aside v-if="session.user" class="desktop-sidebar" aria-label="Club sections">
    <div class="desktop-sidebar-brand">
      <span class="desktop-sidebar-logo">C</span>
      <div>
        <strong>{{ t("tagline") }}</strong>
        <span>{{ t("headline") }}</span>
      </div>
    </div>
    <div class="desktop-sidebar-user">
      <span class="desktop-sidebar-avatar">{{ userInitial }}</span>
      <div>
        <strong>{{ userDisplayName }}</strong>
        <span>{{ userEmail }}</span>
        <em>{{ membershipLabel }}</em>
      </div>
    </div>
    <nav class="desktop-sidebar-nav">
      <button
        v-for="item in visibleNavItems"
        :key="`desktop-${item.id}`"
        class="desktop-sidebar-item"
        :class="{ 'desktop-sidebar-item-active': activeSection === item.id }"
        type="button"
        :aria-label="t(item.labelKey)"
        :aria-pressed="activeSection === item.id"
        @click="selectSection(item.id)"
      >
        <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
        <span>{{ t(item.labelKey) }}</span>
        <span v-if="item.id === 'profile' && notifications.unreadCount > 0" class="desktop-sidebar-dot" aria-label="Есть новые уведомления"></span>
        <span v-if="item.id === 'support' && supportUnreadCount > 0" class="desktop-sidebar-badge">{{ supportUnreadCount > 9 ? "9+" : supportUnreadCount }}</span>
      </button>
    </nav>
  </aside>
  <section class="app-shell">
    ...
  </section>
</div>
```

Keep the existing feature section rendering inside `section.app-shell`.

- [ ] **Step 3: Mark the existing bottom nav as mobile**

Change the bottom nav class to:

```vue
<nav v-if="session.user" class="bottom-nav mobile-bottom-nav" :class="{ 'bottom-nav-collapsed': navCollapsed }" aria-label="Club sections">
```

Change the toggle class to:

```vue
class="bottom-nav-toggle mobile-bottom-nav-toggle"
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @club/web exec vitest run src/App.test.ts`

Expected: still FAIL until CSS media rules are added.

### Task 3: Add Responsive Shell CSS

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add layout tokens**

Extend `:root` with:

```css
--desktop-sidebar-width: clamp(15rem, 18vw, 17.5rem);
--desktop-content-max: 82.5rem;
--desktop-shell-gutter: clamp(1rem, 2.6vw, 2.5rem);
```

- [ ] **Step 2: Add base layout rules near `.app-shell`**

```css
.app-layout {
  width: 100%;
  min-height: var(--app-viewport-height);
}

.desktop-sidebar {
  display: none;
}

.app-shell {
  width: 100%;
  gap: var(--space-section);
  padding: var(--space-section) var(--screen-gutter);
}
```

- [ ] **Step 3: Add desktop media rules**

```css
@media (min-width: 1024px) {
  .app-root {
    --nav-space: 0px;
    min-height: var(--app-viewport-height);
    padding-bottom: 0;
  }

  .app-layout {
    display: grid;
    grid-template-columns: var(--desktop-sidebar-width) minmax(0, 1fr);
    gap: 0;
    min-height: var(--app-viewport-height);
  }

  .desktop-sidebar {
    position: sticky;
    top: 0;
    display: flex;
    height: var(--app-viewport-height);
    min-height: 100dvh;
    flex-direction: column;
    gap: 1rem;
    border-right: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
    background: color-mix(in srgb, var(--panel) 94%, transparent);
    padding: 1.1rem;
    color: var(--text);
    box-shadow: 16px 0 48px rgb(0 0 0 / 18%);
  }

  .app-shell {
    max-width: var(--desktop-content-max);
    min-height: var(--app-viewport-height);
    margin: 0 auto;
    padding: clamp(1rem, 2vw, 1.6rem) var(--desktop-shell-gutter) 2rem;
  }

  .content-panel {
    min-height: calc(var(--app-viewport-height) - 3.2rem);
  }

  .mobile-bottom-nav,
  .mobile-bottom-nav-toggle {
    display: none;
  }
}

@media (max-width: 1023px) {
  .desktop-sidebar {
    display: none;
  }
}
```

- [ ] **Step 4: Add sidebar component rules**

Add rules for `.desktop-sidebar-brand`, `.desktop-sidebar-logo`, `.desktop-sidebar-user`, `.desktop-sidebar-avatar`, `.desktop-sidebar-nav`, `.desktop-sidebar-item`, `.desktop-sidebar-item-active`, `.desktop-sidebar-badge`, and `.desktop-sidebar-dot` with 44px minimum hit targets and visible active state.

- [ ] **Step 5: Run the responsive shell test**

Run: `pnpm --filter @club/web exec vitest run src/App.test.ts`

Expected: PASS.

### Task 4: Verify App Build and Browser Layout

**Files:**
- No source changes expected unless checks reveal layout regressions.

- [ ] **Step 1: Run focused and full checks**

Run:

```bash
pnpm --filter @club/web exec vitest run src/App.test.ts
pnpm check
pnpm test
pnpm build
```

Expected: all commands exit 0. Vite chunk-size warnings are acceptable.

- [ ] **Step 2: Run local production preview**

Run: `pnpm --filter @club/web build`, then serve or preview the web app with the repo's normal Vite tooling.

- [ ] **Step 3: Use Playwright to check viewports**

Check these sizes:

- 375x812: bottom nav visible, sidebar hidden, no horizontal scroll.
- 430x932: bottom nav visible, sidebar hidden, no horizontal scroll.
- 768x1024: bottom nav visible, content wider.
- 1024x768: sidebar visible, bottom nav hidden.
- 1440x900: sidebar visible, content wider than mobile column.

### Task 5: Commit, Push, and Deploy

**Files:**
- Commit modified app shell, CSS, and tests.

- [ ] **Step 1: Commit implementation**

```bash
git add apps/web/src/App.vue apps/web/src/App.test.ts apps/web/src/styles.css docs/superpowers/plans/2026-07-06-responsive-pwa-shell.md
git commit -m "Add responsive PWA shell"
```

- [ ] **Step 2: Push to GitHub**

Run: `git push origin main`

- [ ] **Step 3: Deploy to server**

Run over SSH:

```bash
cd /opt/club-pwa && bash deploy/update.sh
```

- [ ] **Step 4: Verify production**

Check:

```bash
curl -fsS https://club2.myn8nservertest.ru/api/health
curl -I https://club2.myn8nservertest.ru
```

Expected: API returns `{"ok":true}` and page returns HTTP 200.

---

## Self-Review

- The plan covers mobile bottom nav, desktop sidebar, wider desktop content, and tablet transition.
- The plan does not change backend, auth, payments, email, push, or feature ownership.
- Each task has concrete files, commands, and expected outcomes.
- No unresolved markers remain.
