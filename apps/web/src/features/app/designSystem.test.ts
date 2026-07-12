import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA UI foundation design system", () => {
  const foundationPath = resolve(__dirname, "../ui/foundation.css");

  function foundationCss() {
    expect(existsSync(foundationPath)).toBe(true);
    return readFileSync(foundationPath, "utf-8");
  }

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
    const [red = 0, green = 0, blue = 0] = linear;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function contrast(first: string, second: string) {
    const [bright = 0, dark = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (bright + 0.05) / (dark + 0.05);
  }

  it("defines the reference palette and shared component tokens", () => {
    const foundation = foundationCss();
    expect(foundation).toContain("PWA UI Foundation 2026");
    expect(foundation).toContain("--color-bg:");
    expect(foundation).toContain("--color-surface:");
    expect(foundation).toContain("--color-surface-elevated:");
    expect(foundation).toContain("--color-text:");
    expect(foundation).toContain("--color-text-muted:");
    expect(foundation).toContain("--color-border:");
    expect(foundation).toContain("--color-primary:");
    expect(foundation).toContain("--color-primary-text:");
    expect(foundation).toContain("--color-focus:");
    expect(foundation).toContain("--card-radius: 14px;");
    expect(foundation).toContain("--control-height: 48px;");
    expect(foundation).toContain("--icon-button-size: 44px;");
    expect(foundation).toContain("--icon-size: 22px;");
    expect(foundation).toContain("--action-icon-visual-size: 32px;");
    expect(foundation).toContain("--action-icon-glyph-size: 16px;");
  });

  it("defines the reference layout for admin navigation, KPI cards and mobile safe areas", () => {
    const foundation = foundationCss();
    expect(foundation).toContain(".ui-page-container");
    expect(foundation).toContain(".ui-responsive-grid");
    expect(foundation).toContain("padding-bottom: calc(24px + var(--safe-bottom));");
    expect(foundation).toContain("@media (max-width: 360px)");
    expect(foundation).toContain("@media (min-width: 1024px)");
  });

  it("normalizes routed support and lesson task screens after the redesign", () => {
    const foundation = foundationCss();
    expect(foundation).toContain(".ui-task-screen");
    expect(foundation).toContain(".ui-page-header");
    expect(foundation).toContain(".ui-page-content");
    expect(foundation).toContain(".ui-bottom-action-bar");
    expect(foundation).toContain("overflow-wrap: anywhere");
    expect(foundation).not.toContain("overflow-x: hidden");
  });

  it("adds Graphite and Electric Blue as an independent day and night token layer", () => {
    const foundation = foundationCss();
    expect(foundation).toContain('Graphite + Electric Blue theme identity');
    expect(foundation).toMatch(
      /:root\[data-design-theme="graphite-electric-blue"\]\[data-theme="dark"\]\s*\{[\s\S]*--color-bg: #070b12;[\s\S]*--color-surface: #111a28;[\s\S]*--color-primary: #3b82f6;/
    );
    expect(foundation).toMatch(
      /:root\[data-design-theme="graphite-electric-blue"\]\[data-theme="light"\]\s*\{[\s\S]*--color-bg: #eef3f9;[\s\S]*--color-surface: #ffffff;[\s\S]*--color-primary: #2563eb;/
    );
    expect(foundation).toContain(':root[data-design-theme="soft-touch"][data-theme="dark"]');
    expect(foundation).toContain(':root[data-design-theme="soft-touch"][data-theme="light"]');
  });

  it.each(["pine-teal", "warm-clay", "plum-rose"])(
    "defines complete accessible %s day and night palettes",
    (designTheme) => {
      const foundation = foundationCss();
      for (const mode of ["dark", "light"] as const) {
        const block = themeBlock(foundation, designTheme, mode);
        for (const name of [
          "--color-bg",
          "--color-page",
          "--color-surface",
          "--color-surface-elevated",
          "--color-surface-soft",
          "--color-text",
          "--color-text-muted",
          "--color-border",
          "--color-border-strong",
          "--color-primary",
          "--color-primary-strong",
          "--color-primary-text",
          "--color-focus"
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

  it("keeps Graphite dark primary controls readable", () => {
    const block = themeBlock(foundationCss(), "graphite-electric-blue", "dark");
    expect(token(block, "--color-primary-text")).toBe("#07111f");
    expect(contrast(token(block, "--color-primary"), token(block, "--color-primary-text"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps action control sizing in foundation instead of legacy important overrides", () => {
    const foundation = foundationCss();
    const legacyStyles = readFileSync(resolve(__dirname, "../../styles.css"), "utf-8");
    expect(foundation).toContain("--action-icon-button-size: var(--icon-button-size);");
    expect(foundation).toContain("--action-icon-glyph-size: 16px;");
    expect(legacyStyles).not.toContain("Final action-control normalization");
    expect(legacyStyles).not.toContain("width: var(--action-icon-button-size) !important;");
    expect(legacyStyles).not.toContain("height: var(--action-icon-button-size) !important;");
  });
});
