# Expanded Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pine Teal, Warm Clay, and Plum Rose as persistent design themes in light and dark modes while making foundation semantic tokens drive legacy surfaces and gradients.

**Architecture:** Keep `data-theme` as the light/dark mode and expand `data-design-theme` from two to five identities. Define every palette in `features/ui/foundation.css`, then map legacy `--surface*`, `--panel*`, `--ds-*`, and RGB variables to the same semantic tokens so existing screens inherit one coherent theme without a broad CSS rewrite.

**Tech Stack:** Vue 3, Pinia, TypeScript, CSS custom properties, Vitest, Playwright.

## Global Constraints

- Preserve API, routing, authentication, payments, chat, support, roles, storage formats, and PWA behavior.
- Preserve existing layout, spacing, responsive breakpoints, touch target sizes, and visual scale behavior.
- Support exactly five design themes: `dark-soft-touch`, `graphite-electric-blue`, `pine-teal`, `warm-clay`, and `plum-rose`.
- Support `light` and `dark` independently for every design theme.
- Use semantic tokens as the source of truth; do not add another standalone legacy theme layer.
- Maintain WCAG AA contrast of at least 4.5:1 for body text and primary button text.
- Do not deploy to production.

---

### Task 1: Persistent five-theme state contract

**Files:**
- Modify: `apps/web/src/stores/ui.test.ts`
- Modify: `apps/web/src/stores/ui.ts`

**Interfaces:**
- Consumes: existing `Theme`, `localStorage`, and `document.documentElement.dataset` contracts.
- Produces: expanded `DesignTheme` and runtime validation through `isDesignTheme(value: string | null): value is DesignTheme`.

- [ ] **Step 1: Write the failing restoration test**

Add this test to `apps/web/src/stores/ui.test.ts`:

```ts
it.each(["pine-teal", "warm-clay", "plum-rose"] as const)(
  "restores the saved %s design theme independently from the mode",
  (savedDesignTheme) => {
    localStorage.setItem("club-theme", "light");
    localStorage.setItem("club-design-theme", savedDesignTheme);

    const ui = useUiStore();

    expect(ui.theme).toBe("light");
    expect(ui.designTheme).toBe(savedDesignTheme);
    expect(document.documentElement.dataset.designTheme).toBe(savedDesignTheme);
    expect(localStorage.getItem("club-design-theme")).toBe(savedDesignTheme);
  }
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm --filter @club/web test -- src/stores/ui.test.ts
```

Expected: the three new cases fail because saved values currently fall back to `dark-soft-touch`.

- [ ] **Step 3: Implement the minimal validated union**

In `apps/web/src/stores/ui.ts`, expand the type and validate storage values:

```ts
export type DesignTheme =
  | "dark-soft-touch"
  | "graphite-electric-blue"
  | "pine-teal"
  | "warm-clay"
  | "plum-rose";

const designThemes: readonly DesignTheme[] = [
  "dark-soft-touch",
  "graphite-electric-blue",
  "pine-teal",
  "warm-clay",
  "plum-rose"
];

function isDesignTheme(value: string | null): value is DesignTheme {
  return designThemes.includes(value as DesignTheme);
}
```

Initialize `designTheme` with `isDesignTheme(savedDesignTheme) ? savedDesignTheme : "dark-soft-touch"`. Keep `setDesignTheme`, persistence keys, and `applyTheme()` unchanged.

- [ ] **Step 4: Verify GREEN**

Run the focused store test again. Expected: all `ui store` tests pass with no warnings.

- [ ] **Step 5: Commit the state contract**

```powershell
git add apps/web/src/stores/ui.ts apps/web/src/stores/ui.test.ts
git commit -m "feat(ui): support expanded theme identities"
```

---

### Task 2: Appearance selector and localized previews

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Modify: `apps/web/src/features/app/i18n.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: expanded `DesignTheme`, `ui.designTheme`, and `ui.setDesignTheme`.
- Produces: five accessible appearance cards and preview classes `design-theme-preview-pine`, `design-theme-preview-clay`, and `design-theme-preview-plum`.

- [ ] **Step 1: Write the failing source-contract test**

Extend the existing `keeps day and night separate from the two design themes` test in `apps/web/src/App.test.ts`, rename it to `keeps day and night separate from five design themes`, and add:

```ts
const i18nSource = readFileSync(resolve(__dirname, "features/app/i18n.ts"), "utf-8");
const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

for (const value of ["pine-teal", "warm-clay", "plum-rose"]) {
  expect(profileSource).toContain(`value: "${value}"`);
}
for (const key of [
  "profileDesignThemePine",
  "profileDesignThemePineText",
  "profileDesignThemeClay",
  "profileDesignThemeClayText",
  "profileDesignThemePlum",
  "profileDesignThemePlumText"
]) {
  expect(i18nSource).toContain(`${key}:`);
}
for (const previewClass of [
  "design-theme-preview-pine",
  "design-theme-preview-clay",
  "design-theme-preview-plum"
]) {
  expect(styles).toContain(`.${previewClass}`);
}
```

- [ ] **Step 2: Run the focused App test and verify RED**

Run:

```powershell
pnpm --filter @club/web test -- src/App.test.ts
```

Expected: the new theme values, translations, and preview classes are missing.

- [ ] **Step 3: Add the three theme options and translations**

Append to `designThemeOptions` in `ProfileSection.vue`:

```ts
{
  value: "pine-teal",
  label: t("profileDesignThemePine"),
  description: t("profileDesignThemePineText"),
  previewClass: "design-theme-preview-pine"
},
{
  value: "warm-clay",
  label: t("profileDesignThemeClay"),
  description: t("profileDesignThemeClayText"),
  previewClass: "design-theme-preview-clay"
},
{
  value: "plum-rose",
  label: t("profileDesignThemePlum"),
  description: t("profileDesignThemePlumText"),
  previewClass: "design-theme-preview-plum"
}
```

Add Russian copy:

```ts
profileDesignThemePine: "Pine Teal",
profileDesignThemePineText: "Спокойная хвойно-бирюзовая палитра",
profileDesignThemeClay: "Warm Clay",
profileDesignThemeClayText: "Тёплый клубный дизайн",
profileDesignThemePlum: "Plum Rose",
profileDesignThemePlumText: "Мягкий сливово-розовый дизайн",
```

Add English copy:

```ts
profileDesignThemePine: "Pine Teal",
profileDesignThemePineText: "Calm pine and teal palette",
profileDesignThemeClay: "Warm Clay",
profileDesignThemeClayText: "Warm premium club design",
profileDesignThemePlum: "Plum Rose",
profileDesignThemePlumText: "Soft plum and rose design",
```

- [ ] **Step 4: Add exact four-swatch previews**

Add to the existing preview rules in `styles.css`:

```css
.design-theme-preview-pine { background: #06110d; }
.design-theme-preview-pine i { background: #10251c; }
.design-theme-preview-pine i:nth-child(2) { background: #2dd4bf; }
.design-theme-preview-pine i:nth-child(3) { background: #38bdf8; }
.design-theme-preview-pine i:nth-child(4) { background: #f3fbf6; }

.design-theme-preview-clay { background: #120d09; }
.design-theme-preview-clay i { background: #251a13; }
.design-theme-preview-clay i:nth-child(2) { background: #fb923c; }
.design-theme-preview-clay i:nth-child(3) { background: #f59e0b; }
.design-theme-preview-clay i:nth-child(4) { background: #fff8f0; }

.design-theme-preview-plum { background: #100812; }
.design-theme-preview-plum i { background: #251328; }
.design-theme-preview-plum i:nth-child(2) { background: #f472b6; }
.design-theme-preview-plum i:nth-child(3) { background: #a78bfa; }
.design-theme-preview-plum i:nth-child(4) { background: #fff5fe; }
```

- [ ] **Step 5: Verify GREEN and commit**

Run the focused App test. Expected: all assertions pass. Then commit:

```powershell
git add apps/web/src/App.test.ts apps/web/src/features/profile/ProfileSection.vue apps/web/src/features/app/i18n.ts apps/web/src/styles.css
git commit -m "feat(profile): add three theme choices"
```

---

### Task 3: Semantic palettes, compatibility aliases, and contrast

**Files:**
- Modify: `apps/web/src/features/app/designSystem.test.ts`
- Modify: `apps/web/src/features/ui/foundation.css`

**Interfaces:**
- Consumes: `data-design-theme` and `data-theme` root attributes.
- Produces: full semantic token maps for six new mode combinations and compatibility aliases consumed by legacy screen CSS.

- [ ] **Step 1: Add failing token and contrast helpers/tests**

In `designSystem.test.ts`, add helpers that extract one root block and calculate WCAG contrast:

```ts
function themeBlock(foundation: string, designTheme: string, mode: "dark" | "light") {
  const match = foundation.match(
    new RegExp(`:root\\[data-design-theme="${designTheme}"\\]\\[data-theme="${mode}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`)
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

function token(block: string, name: string) {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i"));
  expect(match).not.toBeNull();
  return match?.[1] ?? "#000000";
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
```

Add tests:

```ts
it.each(["pine-teal", "warm-clay", "plum-rose"])(
  "defines complete accessible %s day and night palettes",
  (designTheme) => {
    const foundation = foundationCss();
    for (const mode of ["dark", "light"] as const) {
      const block = themeBlock(foundation, designTheme, mode);
      for (const name of [
        "--color-bg", "--color-page", "--color-surface", "--color-surface-elevated",
        "--color-surface-soft", "--color-text", "--color-text-muted", "--color-border",
        "--color-border-strong", "--color-primary", "--color-primary-strong",
        "--color-primary-text", "--color-focus"
      ]) {
        expect(block).toContain(`${name}:`);
      }
      expect(block).toContain("--color-primary-rgb:");
      expect(block).toContain("--color-support-rgb:");
      expect(contrast(token(block, "--color-text"), token(block, "--color-surface"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(block, "--color-primary"), token(block, "--color-primary-text"))).toBeGreaterThanOrEqual(4.5);
    }
  }
);

it("maps legacy surfaces and RGB channels to semantic theme tokens", () => {
  const foundation = foundationCss();
  expect(foundation).toContain("--surface: var(--color-surface);");
  expect(foundation).toContain("--surface-2: var(--color-surface-elevated);");
  expect(foundation).toContain("--surface-3: var(--color-surface-soft);");
  expect(foundation).toContain("--field: var(--color-surface-soft);");
  expect(foundation).toContain("--ds-primary-rgb: var(--color-primary-rgb);");
  expect(foundation).toContain("--ds-blue-rgb: var(--color-support-rgb);");
});
```

- [ ] **Step 2: Run design-system tests and verify RED**

Run:

```powershell
pnpm --filter @club/web test -- src/features/app/designSystem.test.ts
```

Expected: the three theme selectors and compatibility aliases are absent.

- [ ] **Step 3: Add semantic channel defaults and aliases**

In the root token block of `foundation.css`, add channel defaults:

```css
--color-primary-rgb: 47, 111, 236;
--color-support-rgb: 100, 164, 255;
```

After all theme blocks, add one higher-specificity compatibility layer so it wins over the legacy theme selectors imported earlier from `styles.css`:

```css
:root[data-design-theme][data-theme] {
  --bg: var(--color-bg);
  --surface: var(--color-surface);
  --surface-2: var(--color-surface-elevated);
  --surface-3: var(--color-surface-soft);
  --panel: var(--color-surface);
  --panel-strong: var(--color-surface-elevated);
  --panel-soft: var(--color-surface-soft);
  --panel-muted: var(--color-surface-soft);
  --field: var(--color-surface-soft);
  --line: var(--color-border);
  --border: var(--color-border);
  --text: var(--color-text);
  --text-muted: var(--color-text-muted);
  --muted: var(--color-text-muted);
  --muted-strong: var(--color-text);
  --primary: var(--color-primary);
  --primary-2: var(--color-primary-strong);
  --accent: var(--color-primary);
  --accent-text: var(--color-primary-text);
  --accent-soft: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface));
  --ds-bg: var(--color-bg);
  --ds-bg-elevated: var(--color-page);
  --ds-surface: var(--color-surface);
  --ds-surface-2: var(--color-surface-elevated);
  --ds-surface-3: var(--color-surface-soft);
  --ds-text: var(--color-text);
  --ds-muted: var(--color-text-muted);
  --ds-subtle: var(--color-text-subtle);
  --ds-line: var(--color-border);
  --ds-border: var(--color-border);
  --ds-border-active: color-mix(in srgb, var(--color-primary) 52%, var(--color-border));
  --ds-primary: var(--color-primary);
  --ds-primary-2: var(--color-primary-strong);
  --ds-primary-rgb: var(--color-primary-rgb);
  --ds-blue: var(--color-primary);
  --ds-blue-2: var(--color-primary-strong);
  --ds-blue-rgb: var(--color-support-rgb);
  --segmented-bg: var(--color-surface-soft);
  --modal-bg: var(--color-surface-elevated);
  --media-bg: var(--color-bg);
}
```

- [ ] **Step 4: Add six exact theme blocks**

Update existing Soft Touch and Graphite blocks with their approved comma-separated channel values. Set Graphite Dark `--color-primary-text: #07111f`. Add these six complete blocks before the compatibility layer:

```css
:root[data-design-theme="pine-teal"][data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #06110d;
  --color-page: #0a1915;
  --color-surface: #10251c;
  --color-surface-elevated: #18372a;
  --color-surface-soft: #0c1e17;
  --color-text: #f3fbf6;
  --color-text-muted: #a6b8ae;
  --color-text-subtle: #829a8e;
  --color-border: #315d49;
  --color-border-strong: #477863;
  --color-primary: #2dd4bf;
  --color-primary-strong: #5eead4;
  --color-primary-text: #042f2e;
  --color-primary-rgb: 45, 212, 191;
  --color-support-rgb: 56, 189, 248;
  --color-focus: #5eead4;
  --color-danger: #fb7185;
  --color-danger-soft: #3f1724;
  --color-danger-text: #ffe4e9;
  --color-success: #4ade80;
  --color-success-soft: #12351f;
  --color-warning: #fbbf24;
  --color-warning-soft: #3b2a0c;
  --color-disabled: #14271f;
  --color-disabled-text: #789085;
  --shadow-sm: 0 10px 24px rgb(0 0 0 / 24%);
  --shadow-md: 0 20px 52px rgb(0 0 0 / 32%);
  --shadow-overlay: 0 30px 90px rgb(0 0 0 / 46%);
}

:root[data-design-theme="pine-teal"][data-theme="light"] {
  color-scheme: light;
  --color-bg: #edf5f0;
  --color-page: #f7fbf8;
  --color-surface: #ffffff;
  --color-surface-elevated: #eef6f1;
  --color-surface-soft: #e4f0e9;
  --color-text: #102018;
  --color-text-muted: #5f7268;
  --color-text-subtle: #71857a;
  --color-border: #c5d8cd;
  --color-border-strong: #a8c2b3;
  --color-primary: #0f766e;
  --color-primary-strong: #115e59;
  --color-primary-text: #ffffff;
  --color-primary-rgb: 15, 118, 110;
  --color-support-rgb: 14, 116, 144;
  --color-focus: #0d9488;
  --color-danger: #dc2626;
  --color-danger-soft: #fee2e2;
  --color-danger-text: #991b1b;
  --color-success: #15803d;
  --color-success-soft: #dcfce7;
  --color-warning: #b45309;
  --color-warning-soft: #fef3c7;
  --color-disabled: #e2ebe5;
  --color-disabled-text: #718078;
  --shadow-sm: 0 8px 20px rgb(32 65 48 / 8%);
  --shadow-md: 0 18px 42px rgb(32 65 48 / 12%);
  --shadow-overlay: 0 28px 80px rgb(32 65 48 / 20%);
}

:root[data-design-theme="warm-clay"][data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #120d09;
  --color-page: #1b130e;
  --color-surface: #251a13;
  --color-surface-elevated: #33251b;
  --color-surface-soft: #1e160f;
  --color-text: #fff8f0;
  --color-text-muted: #c2aa96;
  --color-text-subtle: #9e8876;
  --color-border: #5c4433;
  --color-border-strong: #795c46;
  --color-primary: #fb923c;
  --color-primary-strong: #fdba74;
  --color-primary-text: #2a1200;
  --color-primary-rgb: 251, 146, 60;
  --color-support-rgb: 245, 158, 11;
  --color-focus: #fdba74;
  --color-danger: #fb7185;
  --color-danger-soft: #401921;
  --color-danger-text: #ffe4e9;
  --color-success: #4ade80;
  --color-success-soft: #17331f;
  --color-warning: #fbbf24;
  --color-warning-soft: #3b2a0c;
  --color-disabled: #2a2019;
  --color-disabled-text: #927d6c;
  --shadow-sm: 0 10px 24px rgb(0 0 0 / 24%);
  --shadow-md: 0 20px 52px rgb(0 0 0 / 32%);
  --shadow-overlay: 0 30px 90px rgb(0 0 0 / 46%);
}

:root[data-design-theme="warm-clay"][data-theme="light"] {
  color-scheme: light;
  --color-bg: #f2ece4;
  --color-page: #f8f1e8;
  --color-surface: #fffdfc;
  --color-surface-elevated: #ffffff;
  --color-surface-soft: #f3e7da;
  --color-text: #251a13;
  --color-text-muted: #715d4c;
  --color-text-subtle: #89715e;
  --color-border: #d4c1ae;
  --color-border-strong: #bda58f;
  --color-primary: #c2410c;
  --color-primary-strong: #9a3412;
  --color-primary-text: #ffffff;
  --color-primary-rgb: 194, 65, 12;
  --color-support-rgb: 180, 83, 9;
  --color-focus: #ea580c;
  --color-danger: #dc2626;
  --color-danger-soft: #fee2e2;
  --color-danger-text: #991b1b;
  --color-success: #15803d;
  --color-success-soft: #dcfce7;
  --color-warning: #b45309;
  --color-warning-soft: #fef3c7;
  --color-disabled: #eee4d9;
  --color-disabled-text: #806f60;
  --shadow-sm: 0 8px 20px rgb(71 47 29 / 8%);
  --shadow-md: 0 18px 42px rgb(71 47 29 / 12%);
  --shadow-overlay: 0 28px 80px rgb(71 47 29 / 20%);
}

:root[data-design-theme="plum-rose"][data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #100812;
  --color-page: #190d1d;
  --color-surface: #251328;
  --color-surface-elevated: #351c39;
  --color-surface-soft: #201024;
  --color-text: #fff5fe;
  --color-text-muted: #c4abc5;
  --color-text-subtle: #9f85a2;
  --color-border: #65416b;
  --color-border-strong: #83558a;
  --color-primary: #f472b6;
  --color-primary-strong: #f9a8d4;
  --color-primary-text: #310a22;
  --color-primary-rgb: 244, 114, 182;
  --color-support-rgb: 167, 139, 250;
  --color-focus: #f9a8d4;
  --color-danger: #fb7185;
  --color-danger-soft: #431724;
  --color-danger-text: #ffe4e9;
  --color-success: #4ade80;
  --color-success-soft: #17331f;
  --color-warning: #fbbf24;
  --color-warning-soft: #3b2a0c;
  --color-disabled: #2a172d;
  --color-disabled-text: #917793;
  --shadow-sm: 0 10px 24px rgb(0 0 0 / 24%);
  --shadow-md: 0 20px 52px rgb(0 0 0 / 32%);
  --shadow-overlay: 0 30px 90px rgb(0 0 0 / 46%);
}

:root[data-design-theme="plum-rose"][data-theme="light"] {
  color-scheme: light;
  --color-bg: #f4edf5;
  --color-page: #faf5fb;
  --color-surface: #ffffff;
  --color-surface-elevated: #fffaff;
  --color-surface-soft: #f1e5f3;
  --color-text: #2a142d;
  --color-text-muted: #735b75;
  --color-text-subtle: #896c8c;
  --color-border: #d3bed5;
  --color-border-strong: #ba9dbe;
  --color-primary: #a21caf;
  --color-primary-strong: #86198f;
  --color-primary-text: #ffffff;
  --color-primary-rgb: 162, 28, 175;
  --color-support-rgb: 126, 34, 206;
  --color-focus: #c026d3;
  --color-danger: #dc2626;
  --color-danger-soft: #fee2e2;
  --color-danger-text: #991b1b;
  --color-success: #15803d;
  --color-success-soft: #dcfce7;
  --color-warning: #b45309;
  --color-warning-soft: #fef3c7;
  --color-disabled: #eee4ef;
  --color-disabled-text: #806d82;
  --shadow-sm: 0 8px 20px rgb(67 37 70 / 8%);
  --shadow-md: 0 18px 42px rgb(67 37 70 / 12%);
  --shadow-overlay: 0 28px 80px rgb(67 37 70 / 20%);
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run the focused design-system test. Expected: all palette, alias, and contrast assertions pass. Then commit:

```powershell
git add apps/web/src/features/app/designSystem.test.ts apps/web/src/features/ui/foundation.css
git commit -m "feat(ui): add accessible semantic theme palettes"
```

---

### Task 4: Browser persistence, responsive visual review, and regression verification

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Test: existing web unit tests, typecheck, build, and Playwright projects.

**Interfaces:**
- Consumes: profile theme cards and root computed semantic variables.
- Produces: an E2E regression contract for all five identities in both modes.

- [ ] **Step 1: Extend the existing theme E2E test before changing production behavior further**

Replace the two hard-coded design-theme buttons with a table:

```ts
const designThemes = [
  { name: /Dark Soft Touch Premium/, value: "dark-soft-touch" },
  { name: /Graphite \+ Electric Blue/, value: "graphite-electric-blue" },
  { name: /Pine Teal/, value: "pine-teal" },
  { name: /Warm Clay/, value: "warm-clay" },
  { name: /Plum Rose/, value: "plum-rose" }
] as const;
```

Use this loop after locating `root`, `dayButton`, and `nightButton`:

```ts
for (const designTheme of designThemes) {
  const designThemeButton = page.getByRole("button", { name: designTheme.name });
  await expect(designThemeButton).toHaveCount(1);
  await designThemeButton.click();
  await expect(root).toHaveAttribute("data-design-theme", designTheme.value);

  for (const mode of [
    { value: "light", button: dayButton },
    { value: "dark", button: nightButton }
  ] as const) {
    await mode.button.click();
    await expect(root).toHaveAttribute("data-theme", mode.value);
    await expect(root).toHaveAttribute("data-design-theme", designTheme.value);
    await expect
      .poll(() => page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          surface: styles.getPropertyValue("--surface").trim(),
          semanticSurface: styles.getPropertyValue("--color-surface").trim(),
          primaryRgb: styles.getPropertyValue("--ds-primary-rgb").trim(),
          semanticPrimaryRgb: styles.getPropertyValue("--color-primary-rgb").trim()
        };
      }))
      .toEqual(expect.objectContaining({
        surface: expect.any(String),
        semanticSurface: expect.any(String),
        primaryRgb: expect.any(String),
        semanticPrimaryRgb: expect.any(String)
      }));

    const aliases = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        surfaceMatches: styles.getPropertyValue("--surface").trim() === styles.getPropertyValue("--color-surface").trim(),
        primaryRgbMatches: styles.getPropertyValue("--ds-primary-rgb").trim() === styles.getPropertyValue("--color-primary-rgb").trim()
      };
    });
    expect(aliases).toEqual({ surfaceMatches: true, primaryRgbMatches: true });
  }

  await page.reload();
  await expect(root).toHaveAttribute("data-design-theme", designTheme.value);
}

await expectNoHorizontalOverflow(page);
```

- [ ] **Step 2: Run the targeted browser test**

Run:

```powershell
pnpm exec playwright test tests/e2e/app.spec.ts --project=viewport-390-844 --grep "keeps design theme independent"
```

Expected: the test passes after Tasks 1–3. Any computed-token mismatch is a real alias regression and must be fixed in `foundation.css`, not hidden in the test.

- [ ] **Step 3: Run complete automated verification**

Run in order:

```powershell
pnpm --filter @club/web test
pnpm --filter @club/web check
pnpm --filter @club/web build
pnpm exec playwright test tests/e2e/app.spec.ts --project=viewport-390-844 --grep "theme|responsive route audit"
pnpm exec playwright test tests/e2e/app.spec.ts --project=desktop-chrome --grep "theme|responsive route audit"
```

Expected: every command exits 0 with no new console or page errors.

- [ ] **Step 4: Review real screens in all new themes**

At `390x844` and `1440x900`, inspect `/profile`, `/learning`, and `/community` in Pine Teal, Warm Clay, and Plum Rose, both day and night. Confirm card/page separation, readable muted text, primary button contrast, visible selected navigation, modal isolation, and no horizontal overflow. Fix token-level defects only; do not change business logic or layout.

- [ ] **Step 5: Commit E2E coverage**

```powershell
git add tests/e2e/app.spec.ts
git commit -m "test(ui): cover expanded theme persistence"
```
