import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA UI foundation design system", () => {
  const foundationPath = resolve(__dirname, "../ui/foundation.css");

  function foundationCss() {
    expect(existsSync(foundationPath)).toBe(true);
    return readFileSync(foundationPath, "utf-8");
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
    expect(foundation).toContain("--card-radius: 20px;");
    expect(foundation).toContain("--control-height: 48px;");
    expect(foundation).toContain("--icon-button-size: 44px;");
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

  it("keeps action control sizing in foundation instead of legacy important overrides", () => {
    const foundation = foundationCss();
    const legacyStyles = readFileSync(resolve(__dirname, "../../styles.css"), "utf-8");
    expect(foundation).toContain("--action-icon-button-size: var(--icon-button-size);");
    expect(foundation).toContain("--action-icon-glyph-size: var(--icon-size);");
    expect(legacyStyles).not.toContain("Final action-control normalization");
    expect(legacyStyles).not.toContain("width: var(--action-icon-button-size) !important;");
    expect(legacyStyles).not.toContain("height: var(--action-icon-button-size) !important;");
  });
});
