# Admin Navigation Popovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two admin navigation bottom sheets with compact anchored overlay menus and move the preview-mode control into the version metadata group.

**Architecture:** Keep state and permission filtering in `AdminSection.vue`, but replace modal `BottomSheet` rendering with two absolutely positioned menu popovers inside stable anchor wrappers. A shared outside-click/Escape handler enforces mutual exclusion and closes menus without changing routes, stores, API contracts, or admin permissions.

**Tech Stack:** Vue 3 script setup, TypeScript, CSS, Vitest structural contracts, Playwright E2E, pnpm workspace tooling.

## Global Constraints

- Popovers overlay the page without a backdrop and do not affect document flow.
- Only one popover can be open at a time.
- Keep all tap targets at least 44 x 44 px.
- Preserve the existing preview options, permission-filtered panels, routes, stores, API contracts, and business logic.
- Verify widths 320, 390, 768, 1024, and 1440 px.
- Deploy only exact checked commits to `https://club2.myn8nservertest.ru`, server `2.27.28.89`, directory `/opt/club-pwa`.

---

### Task 1: Popover structure and interaction

**Files:**
- Modify: `apps/web/src/features/admin/adminCompactNavigation.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminPermissionsSection.test.ts`
- Modify: `apps/web/src/features/admin/adminStorageSection.test.ts`

**Interfaces:**
- Consumes: `previewModeOptions`, `secondaryPanels`, `selectAdminPanel(panel: AdminPanel)`, `handlePreviewModeChange(mode: PreviewMode)`.
- Produces: `openAdminPopover: Ref<"preview" | "navigation" | null>`, `toggleAdminPopover(name)`, `closeAdminPopovers()`, `admin-preview-mode-menu`, and `admin-navigation-menu`.

- [ ] **Step 1: Write structural tests that require anchored menus and reject BottomSheet**

Assert that `AdminSection.vue` has no `BottomSheet` import, renders `aria-haspopup="menu"`, binds `aria-expanded`, places the preview trigger inside `admin-version-meta`, renders both `role="menu"` popovers, and provides toggle/close handlers.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm --filter @club/web test -- adminCompactNavigation.test.ts adminPermissionsSection.test.ts adminStorageSection.test.ts`

Expected: failures reference remaining `BottomSheet` markup and missing menu state/classes.

- [ ] **Step 3: Implement minimal Vue state and markup**

Replace both sheet booleans with `const openAdminPopover = ref<"preview" | "navigation" | null>(null)`. Add trigger refs and wrappers, toggle one menu at a time, reuse existing selection handlers, and render menu items with `role="menuitemradio"` for preview modes and `role="menuitem"` for panels.

- [ ] **Step 4: Implement dismissal and focus behavior**

Register document `pointerdown` and `keydown` listeners on mount. Close when the pointer target is outside both anchor wrappers or when `Escape` is pressed. Remove listeners on unmount and close popovers when route path changes.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run: `pnpm --filter @club/web test -- adminCompactNavigation.test.ts adminPermissionsSection.test.ts adminStorageSection.test.ts`

Expected: all focused tests pass.

### Task 2: Compact responsive styling

**Files:**
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminCompactNavigation.test.ts`

**Interfaces:**
- Consumes: anchor and menu classes from Task 1.
- Produces: right-aligned version metadata control and viewport-safe overlay menu styles.

- [ ] **Step 1: Add failing CSS contract assertions**

Require the menus to use `position: absolute`, preview menu anchoring beneath `admin-version-meta`, navigation menu right alignment beneath the quick bar, viewport-safe widths, `z-index`, 44 px minimum targets, and no backdrop styles.

- [ ] **Step 2: Run the CSS contract and confirm RED**

Run: `pnpm --filter @club/web test -- adminCompactNavigation.test.ts visualArchitecture.test.ts responsiveLayoutAudit.test.ts`

Expected: missing popover selector and positioning assertions fail.

- [ ] **Step 3: Implement mobile-first styles**

Style `admin-version-meta` as a compact two-part group, keep the mode label on one line, position both menus above page content, preserve the two-column secondary grid and full-width odd final item, and keep menu widths within `calc(100vw - 32px)`.

- [ ] **Step 4: Run the CSS contract and confirm GREEN**

Run: `pnpm --filter @club/web test -- adminCompactNavigation.test.ts visualArchitecture.test.ts responsiveLayoutAudit.test.ts`

Expected: all tests pass without raw tiny typography or overflow guardrail failures.

### Task 3: Browser interaction and visual regression

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `playwright.release.config.ts` only if the existing grep no longer includes the renamed test.

**Interfaces:**
- Consumes: accessible menu names and triggers from Tasks 1-2.
- Produces: E2E proof for toggle, mutual exclusion, dismissal, selection, and responsive layout.

- [ ] **Step 1: Update the E2E test to require non-modal menus**

Assert no dialog appears, opening a trigger sets `aria-expanded="true"`, the corresponding menu is visible, opening the second trigger closes the first, outside click and `Escape` dismiss, and selecting `Рассылки` marks `Ещё` active.

- [ ] **Step 2: Run Android focused E2E and confirm RED before production changes satisfy it**

Run: `pnpm exec playwright test tests/e2e/app.spec.ts --config=playwright.release.config.ts --project=release-android --grep "compact admin navigation"`

Expected: old dialog-based expectations or missing menu semantics fail before the interaction implementation is complete.

- [ ] **Step 3: Complete any minimal interaction fixes and capture screenshots**

Capture the closed quick navigation plus open preview and navigation menus at release viewports, and correct any clipping, overlap, or wrapping defects.

- [ ] **Step 4: Re-run focused E2E and confirm GREEN**

Run the same Playwright command.

Expected: one test passes for release Android.

### Task 4: Release, verification, and production

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: verified popover implementation.
- Produces: next patch release, next service-worker cache, exact production commit.

- [ ] **Step 1: Write failing release assertions**

Require version `6.02`, title `Выпадающая навигация админки`, historical version `6.01`, and cache `club-pwa-v274`.

- [ ] **Step 2: Run release tests and confirm RED**

Run: `pnpm --filter @club/web test -- releaseNotes.test.ts pwa.test.ts`

Expected: current `6.01` and `v273` assertions fail.

- [ ] **Step 3: Publish release metadata and confirm focused GREEN**

Move `6.01` into history, write Russian and English `6.02` release copy, set the update timestamp, and increment the service-worker cache to `v274`; rerun the focused release tests.

- [ ] **Step 4: Run complete verification**

Run: `pnpm test`, `pnpm check`, `pnpm build`, `pnpm test:e2e:release`, and `git diff --check`.

Expected: every command exits 0; release E2E has no unexpected failures.

- [ ] **Step 5: Commit, preflight, push, and deploy exact commit**

Verify public DoH A record `2.27.28.89`, local/server GitHub remote, `/opt/club-pwa`, old server HEAD, and clean commit. Push `main` and wait for the repository `Deploy to VPS` workflow instead of starting a parallel deployment.

- [ ] **Step 6: Verify production independently**

Confirm public `/api/health` and `/api/ready` are 200, index and release assets contain `6.02` and the new title, `sw.js` contains `club-pwa-v274`, admin JS/CSS contain the new menu classes, deploy status reports success for the exact commit, server HEAD matches, and `web`, `api`, `postgres`, and `caddy` are running with required health checks.
