import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const uiDir = resolve(__dirname);

function uiPath(name: string) {
  return resolve(uiDir, name);
}

function readUi(name: string) {
  return readFileSync(uiPath(name), "utf8");
}

describe("PWA UI foundation", () => {
  it("defines one semantic mobile-first token layer", () => {
    expect(existsSync(uiPath("foundation.css"))).toBe(true);

    const css = readUi("foundation.css");
    expect(css).toContain("PWA UI Foundation 2026");
    expect(css).toContain("--page-max-width: 768px;");
    expect(css).toContain("--page-padding: 16px;");
    expect(css).toContain("--page-padding-compact: 12px;");
    expect(css).toContain("--section-gap: 16px;");
    expect(css).toContain("--card-gap: 12px;");
    expect(css).toContain("--card-padding: 16px;");
    expect(css).toContain("--card-radius: 18px;");
    expect(css).toContain("--control-height: 48px;");
    expect(css).toContain("--button-height: 48px;");
    expect(css).toContain("--icon-button-size: 44px;");
    expect(css).toContain("--icon-size: 22px;");
    expect(css).toContain("--header-min-height: 68px;");
    expect(css).toContain("--bottom-nav-height: 68px;");
    expect(css).toContain("--bottom-action-height: 64px;");
    expect(css).toContain("--safe-bottom: env(safe-area-inset-bottom, 0px);");
  });

  it("keeps desktop-UA phone PWA controls visually 44px by scaling tap targets with the full wide-viewport factor", () => {
    const css = readUi("foundation.css");

    expect(css).toContain("--club-scaled-control-factor: var(--club-scaled-ui-factor, 1);");
    expect(css).toContain("--section-gap: calc(16px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--card-gap: calc(12px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--card-padding: calc(16px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--card-radius: calc(18px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--button-height: calc(48px * var(--club-scaled-control-factor));");
    expect(css).toContain("--button-height-large: calc(52px * var(--club-scaled-control-factor));");
    expect(css).toContain("--button-height-compact: calc(44px * var(--club-scaled-control-factor));");
    expect(css).toContain("--icon-button-size: calc(44px * var(--club-scaled-control-factor));");
    expect(css).toContain("--icon-size: calc(22px * var(--club-scaled-control-factor));");
    expect(css).toContain("--header-min-height: calc(68px * var(--club-scaled-control-factor));");
    expect(css).toContain("--bottom-nav-height: calc(68px * var(--club-scaled-control-factor));");
    expect(css).toContain("--bottom-action-height: calc(64px * var(--club-scaled-control-factor));");
    expect(css).not.toContain("--club-scaled-control-factor: min(");
  });

  it("keeps page header actions inline until genuinely narrow phone widths", () => {
    const css = readUi("foundation.css");

    expect(css).toMatch(/@media \(max-width: 380px\)\s*\{[\s\S]*?\.ui-page-header__actions\s*\{[\s\S]*?width: 100%;/);
    expect(css).not.toMatch(/@media \(max-width: 480px\)\s*\{[\s\S]*?\.ui-page-header__actions\s*\{[\s\S]*?width: 100%;/);
  });

  it("lets a single custom footer form span the complete bottom action bar", () => {
    const css = readUi("foundation.css");

    expect(css).toMatch(/\.ui-bottom-action-bar\s*>\s*:only-child\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
  });

  it("defines the four required theme variants through semantic tokens", () => {
    expect(existsSync(uiPath("foundation.css"))).toBe(true);

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
    const files = [
      "UiAppShell.vue",
      "UiPageContainer.vue",
      "UiPageHeader.vue",
      "UiPageSection.vue",
      "UiCard.vue",
      "UiButton.vue",
      "UiIconButton.vue",
      "UiButtonGroup.vue",
      "UiFormField.vue",
      "UiResponsiveGrid.vue",
      "UiBottomActionBar.vue",
      "UiEmptyState.vue",
      "UiLoadingState.vue",
      "UiErrorState.vue"
    ];

    for (const file of files) {
      expect(existsSync(uiPath(file)), `${file} must exist`).toBe(true);
    }

    expect(readUi("UiPageHeader.vue")).toContain("ui-page-header");
    expect(readUi("UiPageHeader.vue")).toContain("ui-page-header__back");
    expect(readUi("UiCard.vue")).toContain("ui-card");
    expect(readUi("UiButton.vue")).toContain("ui-button");
    expect(readUi("UiIconButton.vue")).toContain("ui-icon-button");
    expect(readUi("UiBottomActionBar.vue")).toContain("ui-bottom-action-bar");
  });
});
