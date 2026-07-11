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
    expect(css).toContain("--page-padding: 12px;");
    expect(css).toContain("--page-padding-compact: 10px;");
    expect(css).toContain("--section-gap: 12px;");
    expect(css).toContain("--card-gap: 8px;");
    expect(css).toContain("--card-padding: 12px;");
    expect(css).toContain("--card-radius: 14px;");
    expect(css).toContain("--control-height: 48px;");
    expect(css).toContain("--button-height: 44px;");
    expect(css).toContain("--icon-button-size: 44px;");
    expect(css).toContain("--icon-size: 22px;");
    expect(css).toContain("--action-icon-visual-size: 32px;");
    expect(css).toContain("--action-icon-glyph-size: 16px;");
    expect(css).toContain("--header-min-height: 56px;");
    expect(css).toContain("--bottom-nav-height: 60px;");
    expect(css).toContain("--bottom-action-height: 56px;");
    expect(css).toContain("--safe-bottom: env(safe-area-inset-bottom, 0px);");
  });

  it("keeps desktop-UA phone PWA controls visually 44px by scaling tap targets with the full wide-viewport factor", () => {
    const css = readUi("foundation.css");

    expect(css).toContain("--club-scaled-control-factor: var(--club-scaled-ui-factor, 1);");
    expect(css).toContain("--section-gap: calc(12px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--card-gap: calc(8px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--card-padding: calc(12px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--card-radius: calc(14px * var(--club-scaled-ui-factor));");
    expect(css).toContain("--button-height: calc(44px * var(--club-scaled-control-factor));");
    expect(css).toContain("--button-height-large: calc(48px * var(--club-scaled-control-factor));");
    expect(css).toContain("--button-height-compact: calc(44px * var(--club-scaled-control-factor));");
    expect(css).toContain("--icon-button-size: calc(44px * var(--club-scaled-control-factor));");
    expect(css).toContain("--icon-size: calc(22px * var(--club-scaled-control-factor));");
    expect(css).toContain("--action-icon-visual-size: calc(32px * var(--club-scaled-control-factor));");
    expect(css).toContain("--action-icon-glyph-size: calc(16px * var(--club-scaled-control-factor));");
    expect(css).toContain("--header-min-height: calc(56px * var(--club-scaled-control-factor));");
    expect(css).toContain("--bottom-nav-height: calc(60px * var(--club-scaled-control-factor));");
    expect(css).toContain("--bottom-action-height: calc(56px * var(--club-scaled-control-factor));");
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

  it("keeps the profile visually compact without shrinking its tap targets", () => {
    const css = readUi("foundation.css");

    expect(css).toContain("width: clamp(3.25rem, 14vw, 4rem);");
    expect(css).toContain("font-size: clamp(1rem, 4.2vw, 1.3rem);");
    expect(css).toContain("padding: 10px 12px;");
    expect(css).toContain("min-height: 44px;");
  });

  it("renders action icons thirty percent smaller inside unchanged touch targets", () => {
    const css = readUi("foundation.css");

    expect(css).toContain("width: var(--action-icon-visual-size);");
    expect(css).toContain("height: var(--action-icon-visual-size);");
    expect(css).toContain("width: var(--action-icon-glyph-size) !important;");
    expect(css).toContain("height: var(--action-icon-glyph-size) !important;");
  });

  it("keeps chat emoji visible on the compact light action tile", () => {
    const css = readUi("foundation.css");

    expect(css).toMatch(/\.community-chat-open \.composer-emoji-wrap \.icon-button\s*\{[^}]*color:\s*var\(--color-text\);/s);
    expect(css).toMatch(/\.community-chat-open \.chat-input-row \.icon-button\[type="submit"\]\s*\{[^}]*color:\s*var\(--color-primary-text\);/s);
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
