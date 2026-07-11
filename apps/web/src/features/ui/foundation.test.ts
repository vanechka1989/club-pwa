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
    expect(css).toContain("--section-gap: 24px;");
    expect(css).toContain("--card-padding: 20px;");
    expect(css).toContain("--card-radius: 20px;");
    expect(css).toContain("--control-height: 48px;");
    expect(css).toContain("--button-height: 48px;");
    expect(css).toContain("--icon-button-size: 52px;");
    expect(css).toContain("--bottom-nav-height: 76px;");
    expect(css).toContain("--bottom-action-height: 72px;");
    expect(css).toContain("--safe-bottom: env(safe-area-inset-bottom, 0px);");
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
