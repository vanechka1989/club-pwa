# Profile Appearance Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align profile theme choices, migrate every client once to Warm Clay light, and prevent accidental touch-slider scale changes during vertical scrolling.

**Architecture:** The Pinia UI store owns a version-7 one-time appearance migration and remains the persistence boundary. The profile component keeps semantic buttons but drops the conflicting generic button layout class, while component CSS supplies explicit grid tracks and a coarse-pointer media rule that gives vertical scrolling priority over the range input.

**Tech Stack:** Vue 3, Pinia, TypeScript, CSS media queries, Vitest, Playwright.

## Global Constraints

- Version `7` resets every missing or older appearance version to `theme = "light"` and `designTheme = "warm-clay"` exactly once.
- Version-7 valid saved choices must be restored without another reset.
- Coarse touch pointers change scale only through the existing minus/plus buttons; mouse, trackpad, and keyboard range operation remain.
- Keep all five themes, current palette values, scale limits `0.8..1.4`, and step `0.1`.
- Preserve semantic buttons, `aria-pressed`, accessible names, focus rings, and 44 px touch targets.
- Do not deploy without an explicit user request.

---

### Task 1: One-time Warm Clay light migration

**Files:**
- Modify: `apps/web/src/stores/ui.test.ts`
- Modify: `apps/web/src/stores/ui.ts`

**Interfaces:**
- Consumes: localStorage keys `club-appearance-version`, `club-theme`, and `club-design-theme`.
- Produces: version-7 initialization that returns `Theme` and `DesignTheme` refs and persists the migrated values.

- [ ] **Step 1: Replace the old default test and add migration/restore tests**

```ts
it("defaults new clients to Warm Clay in day mode", () => {
  const ui = useUiStore();
  expect(ui.theme).toBe("light");
  expect(ui.designTheme).toBe("warm-clay");
  expect(localStorage.getItem("club-appearance-version")).toBe("7");
});

it("migrates an existing version-6 appearance to Warm Clay day exactly once", () => {
  localStorage.setItem("club-appearance-version", "6");
  localStorage.setItem("club-theme", "dark");
  localStorage.setItem("club-design-theme", "graphite-electric-blue");
  const ui = useUiStore();
  expect(ui.theme).toBe("light");
  expect(ui.designTheme).toBe("warm-clay");
  expect(localStorage.getItem("club-appearance-version")).toBe("7");
});

it("restores a valid version-7 appearance after the migration", () => {
  localStorage.setItem("club-appearance-version", "7");
  localStorage.setItem("club-theme", "dark");
  localStorage.setItem("club-design-theme", "pine-teal");
  const ui = useUiStore();
  expect(ui.theme).toBe("dark");
  expect(ui.designTheme).toBe("pine-teal");
});
```

- [ ] **Step 2: Run the store tests and verify RED**

Run: `pnpm --filter @club/web test -- src/stores/ui.test.ts`

Expected: failures show the current Dark Soft Touch dark default, version `6`, and restored version-6 values.

- [ ] **Step 3: Implement the version-7 migration gate**

```ts
const appearanceStorageVersion = "7";

const savedAppearanceVersion = localStorage.getItem("club-appearance-version");
const restoreSavedAppearance = savedAppearanceVersion === appearanceStorageVersion;
const savedTheme = localStorage.getItem("club-theme");
const theme = ref<Theme>(restoreSavedAppearance && savedTheme === "dark" ? "dark" : "light");
const savedDesignTheme = localStorage.getItem("club-design-theme");
const designTheme = ref<DesignTheme>(
  restoreSavedAppearance && isDesignTheme(savedDesignTheme) ? savedDesignTheme : "warm-clay"
);
```

- [ ] **Step 4: Run the store tests and verify GREEN**

Run: `pnpm --filter @club/web test -- src/stores/ui.test.ts`

Expected: every UI-store test passes, including manual persistence and clamping tests.

- [ ] **Step 5: Commit the migration**

```bash
git add apps/web/src/stores/ui.ts apps/web/src/stores/ui.test.ts
git commit -m "feat(ui): default everyone to Warm Clay day"
```

---

### Task 2: Stable theme-row grid and touch-safe scale

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `designThemeOptions`, `ui.setDesignTheme()`, `ui.setVisualScale()`, and existing scale step buttons.
- Produces: `.design-theme-choice` as the sole layout class, a coarse-pointer `.visual-scale-range` rule, and browser regression coverage for both pointer types.

- [ ] **Step 1: Add source-level regression assertions**

```ts
it("keeps appearance rows aligned and prevents touch slider drags", () => {
  const profileSource = readFileSync(resolve(__dirname, "features/profile/ProfileSection.vue"), "utf-8");
  const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

  expect(profileSource).toContain('class="design-theme-choice"');
  expect(profileSource).not.toContain('class="design-theme-choice ui-button"');
  expect(styles).toMatch(/\.design-theme-choice\s*\{[\s\S]*grid-template-columns:\s*2\.55rem minmax\(0, 1fr\) 1\.7rem;/);
  expect(styles).toMatch(/@media \(hover: none\) and \(pointer: coarse\)[\s\S]*\.visual-scale-range\s*\{[\s\S]*pointer-events:\s*none;/);
});
```

- [ ] **Step 2: Add mobile and desktop behavior assertions**

```ts
test("uses Warm Clay day and protects mobile scale from accidental swipes", async ({ page }, testInfo) => {
  await page.goto("/profile");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveAttribute("data-design-theme", "warm-clay");

  const range = page.locator(".visual-scale-range");
  const pointerEvents = await range.evaluate((element) => getComputedStyle(element).pointerEvents);
  if (testInfo.project.name === "viewport-390-844") {
    expect(pointerEvents).toBe("none");
    await page.getByRole("button", { name: "Увеличить масштаб интерфейса" }).click();
    await expect(root).toHaveAttribute("data-visual-scale", "1.0");
  } else {
    expect(pointerEvents).toBe("auto");
  }
});
```

- [ ] **Step 3: Run the source and browser tests and verify RED**

Run: `pnpm --filter @club/web test -- src/App.test.ts`

Run: `pnpm exec playwright test tests/e2e/app.spec.ts --project=viewport-390-844 --project=desktop-chrome --grep "protects mobile scale"`

Expected: the source test reports the generic `ui-button` class, non-explicit grid columns, and missing coarse-pointer rule; mobile E2E reports `pointer-events: auto`.

- [ ] **Step 4: Remove the conflicting layout class**

```vue
<button
  v-for="option in designThemeOptions"
  :key="option.value"
  class="design-theme-choice"
  :class="{ 'design-theme-choice-active': ui.designTheme === option.value }"
  type="button"
  :aria-pressed="ui.designTheme === option.value"
  @click="ui.setDesignTheme(option.value)"
>
```

- [ ] **Step 5: Add explicit grid tracks and the touch-pointer rule**

```css
.design-theme-choice {
  grid-template-columns: 2.55rem minmax(0, 1fr) 1.7rem;
}

@media (hover: none) and (pointer: coarse) {
  .visual-scale-range {
    pointer-events: none;
    touch-action: pan-y;
    cursor: default;
  }
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/web test -- src/App.test.ts src/stores/ui.test.ts`

Run: `pnpm exec playwright test tests/e2e/app.spec.ts --project=viewport-390-844 --project=desktop-chrome --grep "protects mobile scale"`

Expected: both unit test files and both Playwright projects pass.

- [ ] **Step 7: Commit the interaction and alignment fix**

```bash
git add apps/web/src/App.test.ts apps/web/src/features/profile/ProfileSection.vue apps/web/src/styles.css tests/e2e/app.spec.ts
git commit -m "fix(profile): stabilize appearance controls"
```

---

### Task 3: Browser regression and visual verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: profile appearance controls, computed `.visual-scale-range` styles, localStorage persistence, and Playwright mobile/desktop projects.
- Produces: verified production-ready behavior across mobile and desktop viewports.

- [ ] **Step 1: Capture and inspect profile screenshots**

Run the project Playwright profile route audit at widths `320`, `390`, `768`, `1024`, and `1440`.

Expected: previews share one vertical line, copy shares one vertical line, selection circles share one vertical line, and no text or controls overflow.

- [ ] **Step 2: Run full verification**

```bash
pnpm --filter @club/web test
pnpm --filter @club/web check
pnpm --filter @club/web build
pnpm exec playwright test tests/e2e/app.spec.ts --project=viewport-390-844 --project=desktop-chrome --grep "appearance|design theme|responsive"
git diff --check
```

Expected: zero failed tests, successful typecheck/build, no horizontal overflow, and no whitespace errors.
