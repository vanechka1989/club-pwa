# PWA UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PWA to one mobile-first UI foundation with shared tokens, base components, migrated screens, cleaned conflicting CSS, route screenshots, and verification without changing business logic.

**Architecture:** Add a small `features/ui` foundation layer and migrate the existing large route components to consume it through shared component classes and Vue wrappers. Keep API calls, stores, routes, i18n keys, service worker behavior, payment logic, chat logic, support ticket logic, and upload logic intact. Delete or quarantine legacy CSS only after the related screen is covered by foundation tests and migrated markup.

**Tech Stack:** Vue 3, Vite, Pinia, vue-router, lucide-vue-next, Tailwind v4, Vitest, Playwright, existing PWA service worker.

## Global Constraints

- Preserve business logic, API contracts, routes, roles, payments, lessons, support, notifications, uploads, PWA manifest, and service worker behavior.
- Use `pwa-ui-master` standards: shared semantic tokens first, mobile-first from 320 px, safe-area support, minimum 44 x 44 px tap targets, route screenshots, accessibility/PWA checks.
- Support four theme variants: Dark Soft Touch day/night and Graphite + Electric Blue day/night.
- Do not fix overflow by globally hiding it; fix root flex/grid/text causes.
- Do not use fixed card/page heights to mask layout problems.
- Use TDD: tests fail before production implementation.
- Work on branch `responsive-layout-audit`, not `main`/`master`.

---

## File Structure

### New files

- `apps/web/src/features/ui/foundation.css` — canonical tokens, theme aliases, base component classes, safe-area variables, responsive layout rules.
- `apps/web/src/features/ui/index.ts` — exports UI components.
- `apps/web/src/features/ui/UiAppShell.vue` — app-level shell wrapper for main scroll surface.
- `apps/web/src/features/ui/UiPageContainer.vue` — constrained route/page container.
- `apps/web/src/features/ui/UiPageHeader.vue` — shared page/task header.
- `apps/web/src/features/ui/UiPageSection.vue` — vertical section wrapper.
- `apps/web/src/features/ui/UiCard.vue` — shared card primitive.
- `apps/web/src/features/ui/UiButton.vue` — shared button primitive.
- `apps/web/src/features/ui/UiIconButton.vue` — shared 44/48 px icon button primitive.
- `apps/web/src/features/ui/UiButtonGroup.vue` — adaptive button grid.
- `apps/web/src/features/ui/UiFormField.vue` — label/help/error field wrapper.
- `apps/web/src/features/ui/UiResponsiveGrid.vue` — adaptive minmax grid.
- `apps/web/src/features/ui/UiBottomActionBar.vue` — sticky/fixed-safe bottom action wrapper.
- `apps/web/src/features/ui/UiEmptyState.vue` — designed empty state.
- `apps/web/src/features/ui/UiLoadingState.vue` — designed loading state.
- `apps/web/src/features/ui/UiErrorState.vue` — designed error state.
- `apps/web/src/features/ui/foundation.test.ts` — token/component contract tests.
- `tests/e2e/pwa-ui-foundation.spec.ts` — route geometry and screenshot audit.
- `tests/e2e/pwa-ui-routes.ts` — route list used by visual audits.
- `scripts/pwa-ui-audit.mjs` — local copy/wrapper of `pwa-ui-master` screenshot audit if the bundled script needs repo-specific config.

### Modified files

- `apps/web/src/main.ts` — import foundation CSS before legacy CSS during migration, then legacy cleanup can reduce dependency on old rules.
- `apps/web/src/App.vue` — consume shared shell/container classes and normalize bottom navigation/action controls.
- `apps/web/src/features/app/TaskScreen.vue` — use `UiPageHeader`, `UiPageContainer`, and `UiBottomActionBar` semantics while preserving slots/events.
- `apps/web/src/features/app/keyboardFocus.ts` — keep only keyboard behavior needed after sticky/flow bottom panels.
- `apps/web/src/features/app/designSystem.test.ts` — replace old string assertions with foundation token assertions.
- `apps/web/src/features/app/responsiveLayoutAudit.test.ts` — assert foundation selectors instead of repeated legacy overrides.
- `apps/web/src/features/profile/ProfileSection.vue` — migrate profile header, avatar actions, stats, referral card, notification controls.
- `apps/web/src/features/learning/LearningSection.vue` — migrate module cards, lesson cards, task screens, editor forms.
- `apps/web/src/features/community/CommunitySection.vue` — migrate community list, chat header, messages, composer controls.
- `apps/web/src/features/billing/PaymentsSection.vue` — migrate payment header, plan cards, plan action buttons, provider task screens.
- `apps/web/src/features/support/SupportSection.vue` — migrate support list, ticket detail, reply form, attachment controls.
- `apps/web/src/features/app/NotificationCenterScreen.vue` — migrate notification task page.
- `apps/web/src/features/admin/AdminSection.vue` — migrate admin tabs, cards, clients, mailings, storage, payments, server, settings, admin access task screens.
- `apps/web/src/features/app/version.ts` — bump app version after implementation.
- `apps/web/public/sw.js` or equivalent service worker file — bump cache name after implementation if this repo stores SW there.
- `apps/web/src/styles.css` — delete duplicate legacy sections and keep only app-specific styles not covered by foundation.

---

### Task 1: RED tests for foundation contracts

**Files:**
- Create: `apps/web/src/features/ui/foundation.test.ts`
- Modify: `apps/web/src/features/app/designSystem.test.ts`
- Modify: `apps/web/src/features/app/responsiveLayoutAudit.test.ts`

**Interfaces:**
- Consumes: current `apps/web/src/styles.css`, Vue SFC source files.
- Produces: failing tests that require `features/ui/foundation.css`, foundation components, and route/shell adoption.

- [ ] **Step 1: Write failing foundation CSS/component contract tests**

Create `apps/web/src/features/ui/foundation.test.ts` with tests that read `foundation.css` and component source files:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const uiDir = resolve(__dirname);

function readUi(name: string) {
  return readFileSync(resolve(uiDir, name), "utf8");
}

describe("PWA UI foundation", () => {
  it("defines one semantic mobile-first token layer", () => {
    const css = readUi("foundation.css");
    expect(css).toContain("PWA UI Foundation 2026");
    expect(css).toContain("--page-max-width: 768px;");
    expect(css).toContain("--page-padding: 16px;");
    expect(css).toContain("--page-padding-compact: 12px;");
    expect(css).toContain("--section-gap: 24px;");
    expect(css).toContain("--card-padding: 20px;");
    expect(css).toContain("--card-radius: 20px;");
    expect(css).toContain("--control-height: 48px;");
    expect(css).toContain("--button-height: 48px;");
    expect(css).toContain("--icon-button-size: 44px;");
    expect(css).toContain("--bottom-nav-height: 76px;");
    expect(css).toContain("--bottom-action-height: 72px;");
    expect(css).toContain("--safe-bottom: env(safe-area-inset-bottom, 0px);");
  });

  it("defines the four required theme variants through semantic tokens", () => {
    const css = readUi("foundation.css");
    expect(css).toContain(':root[data-design-theme="soft-touch"][data-theme="light"]');
    expect(css).toContain(':root[data-design-theme="soft-touch"][data-theme="dark"]');
    expect(css).toContain(':root[data-design-theme="graphite-electric-blue"][data-theme="light"]');
    expect(css).toContain(':root[data-design-theme="graphite-electric-blue"][data-theme="dark"]');
    expect(css).toContain("--color-bg:");
    expect(css).toContain("--color-surface:");
    expect(css).toContain("--color-primary:");
    expect(css).toContain("--color-focus:");
    expect(css).toContain("--shadow-md:");
  });

  it("provides reusable UI primitives used by routed screens", () => {
    expect(readUi("UiPageHeader.vue")).toContain("ui-page-header");
    expect(readUi("UiPageHeader.vue")).toContain("ui-page-header__back");
    expect(readUi("UiCard.vue")).toContain("ui-card");
    expect(readUi("UiButton.vue")).toContain("ui-button");
    expect(readUi("UiIconButton.vue")).toContain("ui-icon-button");
    expect(readUi("UiBottomActionBar.vue")).toContain("ui-bottom-action-bar");
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm --filter @club/web test -- apps/web/src/features/ui/foundation.test.ts
```

Expected: FAIL because `features/ui/foundation.css` and components do not exist yet.

- [ ] **Step 3: Update existing design system tests to fail on legacy-only CSS**

Change `apps/web/src/features/app/designSystem.test.ts` so it expects `foundation.css` and the four semantic theme selectors instead of only the old `styles.css` layer.

- [ ] **Step 4: Update responsive layout tests to require foundation classes**

Change `apps/web/src/features/app/responsiveLayoutAudit.test.ts` to assert `.ui-app-shell`, `.ui-page-container`, `.ui-page-header`, `.ui-card`, `.ui-icon-button`, `.ui-bottom-action-bar`, and to assert `TaskScreen.vue` imports `UiPageHeader` or `UiPageContainer`.

- [ ] **Step 5: Run focused RED tests**

Run:

```bash
pnpm --filter @club/web test -- apps/web/src/features/ui/foundation.test.ts apps/web/src/features/app/designSystem.test.ts apps/web/src/features/app/responsiveLayoutAudit.test.ts
```

Expected: FAIL for missing foundation files/imports/selectors.

---

### Task 2: Implement foundation tokens and primitives

**Files:**
- Create: all files under `apps/web/src/features/ui/`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- Consumes: Vue slot/component conventions.
- Produces: exported UI primitives and canonical CSS classes for later tasks.

- [ ] **Step 1: Create `foundation.css`**

Add semantic tokens, theme selectors, base layout classes, text wrapping rules, input/button sizing, safe-area variables, and mobile breakpoints. Include:

```css
/* PWA UI Foundation 2026 */
:root {
  --page-max-width: 768px;
  --page-padding: 16px;
  --page-padding-compact: 12px;
  --section-gap: 24px;
  --card-gap: 16px;
  --card-padding: 20px;
  --card-padding-compact: 16px;
  --card-radius: 20px;
  --card-radius-compact: 18px;
  --control-height: 48px;
  --button-height: 48px;
  --button-height-large: 52px;
  --button-height-compact: 44px;
  --icon-button-size: 44px;
  --bottom-nav-height: 76px;
  --bottom-action-height: 72px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}
```

- [ ] **Step 2: Create Vue primitives**

Create the UI components listed in the file structure. Each component must:

- accept `as` or simple variant props only where useful;
- render slots without business logic;
- use foundation classes;
- preserve accessible names for icon buttons;
- not import stores or APIs.

- [ ] **Step 3: Export primitives**

Create `apps/web/src/features/ui/index.ts` exporting every component.

- [ ] **Step 4: Import foundation CSS**

Modify `apps/web/src/main.ts`:

```ts
import "./features/ui/foundation.css";
import "./styles.css";
```

- [ ] **Step 5: Run focused GREEN tests**

Run:

```bash
pnpm --filter @club/web test -- apps/web/src/features/ui/foundation.test.ts apps/web/src/features/app/designSystem.test.ts
```

Expected: PASS for foundation/token/component contract tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/ui apps/web/src/main.ts apps/web/src/features/app/designSystem.test.ts
git commit -m "feat: add pwa ui foundation"
```

---

### Task 3: Migrate app shell, task screens, bottom nav, and action controls

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/features/app/TaskScreen.vue`
- Modify: `apps/web/src/features/app/keyboardFocus.ts`
- Modify: `apps/web/src/features/app/responsiveLayoutAudit.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: UI primitives from Task 2.
- Produces: one app scroll surface, one task screen layout, consistent nav/action controls.

- [ ] **Step 1: Write/update RED tests for shell adoption**

Assert source contains:

```ts
expect(appSource).toContain("ui-app-shell");
expect(appSource).toContain("ui-page-container");
expect(taskScreenSource).toContain("UiPageHeader");
expect(taskScreenSource).toContain("UiBottomActionBar");
```

Run the focused test and verify it fails before migration.

- [ ] **Step 2: Migrate `TaskScreen.vue`**

Replace custom header/body/footer markup with foundation wrappers while preserving props, slots, `portal`, and `back` event.

- [ ] **Step 3: Normalize app shell classes**

Add foundation classes to the main App shell/page host and bottom navigation without changing routing logic.

- [ ] **Step 4: Replace final action button override with foundation class rules**

In `styles.css`, remove the latest `!important` action-control normalization once `.icon-button`, `.task-screen-back`, `.profile-avatar-icon-button`, `.support-file-icon-button`, and `.mini-action` are covered by foundation sizing.

- [ ] **Step 5: Run focused tests**

```bash
pnpm --filter @club/web test -- apps/web/src/features/app/responsiveLayoutAudit.test.ts apps/web/src/features/app/keyboardFocus.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.vue apps/web/src/features/app/TaskScreen.vue apps/web/src/features/app/keyboardFocus.ts apps/web/src/features/app/responsiveLayoutAudit.test.ts apps/web/src/styles.css
git commit -m "refactor: migrate app shell to ui foundation"
```

---

### Task 4: Migrate user-facing section screens

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/community/CommunitySection.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/support/SupportSection.vue`
- Modify: `apps/web/src/features/app/NotificationCenterScreen.vue`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: foundation primitives and classes.
- Produces: consistent headers, cards, forms, icon buttons, text wrapping, keyboard-safe ticket/chat layouts.

- [ ] **Step 1: Write RED source contract tests for user sections**

Extend `responsiveLayoutAudit.test.ts` to read each user section and assert the presence of foundation classes/imports:

```ts
expect(profileSource).toContain("ui-page-header");
expect(learningSource).toContain("ui-card");
expect(communitySource).toContain("ui-icon-button");
expect(paymentsSource).toContain("ui-button");
expect(supportSource).toContain("ui-bottom-action-bar");
```

Run focused tests and verify RED.

- [ ] **Step 2: Profile migration**

Normalize profile header, language/notification controls, avatar action buttons, account card, access card, stats card, and referral card.

- [ ] **Step 3: Learning migration**

Normalize module list, module action buttons, lesson cards, lesson task screens, lesson content cards, editor fields, file controls, and empty/loading states.

- [ ] **Step 4: Community migration**

Normalize community topic list, create topic form, chat header back/menu buttons, message bubbles, composer icon buttons, and keyboard-safe composer behavior.

- [ ] **Step 5: Payments migration**

Normalize payment header, provider card, tariff cards, pay/admin action buttons, plan create/edit task screens, provider task screen, and disabled states.

- [ ] **Step 6: Support migration**

Normalize support list, new ticket form, ticket detail header, customer card, message list, reply textarea, attachment button, close/send action hierarchy, and keyboard-safe footer.

- [ ] **Step 7: Notification center migration**

Normalize notification task header, push action, clear/delete action, empty state, and notification list cards.

- [ ] **Step 8: Remove user-section legacy CSS conflicts**

Delete duplicated legacy rules for migrated user-section controls where foundation now owns size/spacing/radius.

- [ ] **Step 9: Run focused tests**

```bash
pnpm --filter @club/web test -- apps/web/src/features/profile apps/web/src/features/learning apps/web/src/features/community apps/web/src/features/billing apps/web/src/features/support apps/web/src/features/app/responsiveLayoutAudit.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/profile apps/web/src/features/learning apps/web/src/features/community apps/web/src/features/billing apps/web/src/features/support apps/web/src/features/app/NotificationCenterScreen.vue apps/web/src/features/app/responsiveLayoutAudit.test.ts apps/web/src/styles.css
git commit -m "refactor: migrate user screens to ui foundation"
```

---

### Task 5: Migrate admin and deep task screens

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/app/responsiveLayoutAudit.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: foundation primitives/classes.
- Produces: consistent admin tabs, cards, forms, task screens, bottom action panels.

- [ ] **Step 1: Write RED admin source contract tests**

Assert `AdminSection.vue` uses foundation classes for:

- admin section header;
- admin grid/cards;
- clients;
- client detail task;
- mailings/new mailing task;
- payments drilldowns;
- storage;
- server logs;
- admin permissions.

- [ ] **Step 2: Admin root migration**

Normalize admin page header, role preview switcher, version badge, tab grid, KPI cards, and section cards.

- [ ] **Step 3: Client/task migration**

Normalize client detail header, email/ID wrapping, action block, manual access date, save/write hierarchy, profile metric grids.

- [ ] **Step 4: Mailings migration**

Normalize mailings list, mailing detail, new mailing composer sections, recipient filters, attachment, scheduling, calculation, and sticky action bar.

- [ ] **Step 5: Payments/storage/server/settings migration**

Normalize all admin cards, forms, logs, file controls, dropdowns, and empty/error states.

- [ ] **Step 6: Remove admin legacy CSS conflicts**

Delete duplicated admin-specific fixed heights, one-off spacing, mini button sizes, and conflicting task screen overrides now owned by foundation.

- [ ] **Step 7: Run focused admin tests**

```bash
pnpm --filter @club/web test -- apps/web/src/features/admin apps/web/src/features/app/responsiveLayoutAudit.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/admin apps/web/src/features/app/responsiveLayoutAudit.test.ts apps/web/src/styles.css
git commit -m "refactor: migrate admin screens to ui foundation"
```

---

### Task 6: Add route visual audit and screenshots

**Files:**
- Create: `tests/e2e/pwa-ui-routes.ts`
- Create/Modify: `tests/e2e/pwa-ui-foundation.spec.ts`
- Create/Modify: `scripts/pwa-ui-audit.mjs`
- Modify: `playwright.config.ts` only if the new audit file needs a project/output setting not already covered by the current config.

**Interfaces:**
- Consumes: existing Playwright setup and route navigation.
- Produces: automated route geometry checks and screenshot artifacts.

- [ ] **Step 1: Write RED Playwright route audit**

Create route list covering:

```ts
export const pwaUiRoutes = [
  "/profile",
  "/profile/avatar",
  "/learning",
  "/community",
  "/payments",
  "/support",
  "/support/new",
  "/admin",
  "/admin/releases",
  "/admin/mailings/new",
  "/admin/storage/files",
  "/admin/server/logs"
] as const;
```

Add tests for viewports `320x720`, `390x844`, `768x1024`, `1024x768`, `1440x900`:

- no document/body horizontal overflow;
- no significant element wider than viewport;
- buttons and role=button elements at least 44 px tall unless explicitly exempted;
- bottom nav/action bar does not cover final meaningful content;
- screenshots saved for every route/viewport.

- [ ] **Step 2: Run RED/initial audit**

```bash
pnpm test:e2e -- tests/e2e/pwa-ui-foundation.spec.ts
```

Expected before final CSS cleanup: at least one failure or screenshot diff/work item if route setup exposes current issues.

- [ ] **Step 3: Add local audit script wrapper**

Copy or wrap `pwa-ui-master/scripts/pwa-ui-audit.mjs` so it uses the project route list and saves to `test-results/pwa-ui-audit/<timestamp>`.

- [ ] **Step 4: Run audit and fix findings**

Run:

```bash
node scripts/pwa-ui-audit.mjs
```

Fix route-specific defects found by the audit.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/pwa-ui-routes.ts tests/e2e/pwa-ui-foundation.spec.ts scripts/pwa-ui-audit.mjs playwright.config.ts apps/web/src apps/web/src/styles.css
git commit -m "test: add pwa ui visual route audit"
```

---

### Task 7: Final CSS cleanup, version bump, and cache update

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`
- Modify: release notes if existing project convention requires it.

**Interfaces:**
- Consumes: migrated foundation and passing route tests.
- Produces: reduced legacy CSS conflict surface and deployable new app version.

- [ ] **Step 1: Add CSS regression tests for conflict removal**

Assert no late `Final action-control normalization` block remains and that duplicate foundation-owned selectors are reduced.

- [ ] **Step 2: Delete conflicting CSS blocks**

Remove old duplicate definitions for migrated:

- `.section-head`;
- `.soft-card`;
- `.surface-card`;
- `.primary-button`;
- `.secondary-button`;
- `.icon-button`;
- `.bottom-nav`;
- `.task-screen`;
- support reply layout;
- admin mailing bottom actions;
- profile avatar icon buttons;
- payment product admin actions.

Keep content-specific CSS that is not foundation-owned.

- [ ] **Step 3: Bump version/cache**

Update app version and SW cache name so installed PWA receives fresh assets.

- [ ] **Step 4: Run full local verification**

```bash
pnpm -r test
pnpm -r check
pnpm -r build
pnpm test:e2e -- tests/e2e/pwa-ui-foundation.spec.ts
node scripts/pwa-ui-audit.mjs
```

Expected: all pass or documented, specific non-blocking limitations only.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles.css apps/web/src/features/app/version.ts apps/web/public/sw.js apps/web/src/features/app/releaseNotes.ts
git commit -m "chore: release pwa ui foundation"
```

---

### Task 8: Deploy and production verification

**Files:**
- No source files unless deployment requires config update.

**Interfaces:**
- Consumes: passing local build/tests and pushed branch.
- Produces: deployed production with verified new version/cache and screenshots.

- [ ] **Step 1: Push branch/main according to existing deployment workflow**

Use the same deployment method used for recent versions.

- [ ] **Step 2: Verify production version and assets**

Check:

- `/` loads new JS/CSS assets;
- app version shows the bumped version;
- service worker cache name changed;
- ticket/support pages load updated layout;
- notification/admin pages no longer show narrow cropped cards.

- [ ] **Step 3: Run production route screenshot sanity**

Run the visual audit against production URL for required viewports.

- [ ] **Step 4: Final report**

Report:

- foundation components created;
- root causes fixed;
- pages checked/changed;
- fixed heights removed;
- keyboard behavior;
- bottom panels;
- tested breakpoints/themes;
- build/lint/typecheck/test/e2e/audit results;
- deployment/version/cache result;
- remaining limitations.
