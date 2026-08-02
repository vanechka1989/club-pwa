import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "adminRoute.css"), "utf8");

describe("compact admin navigation", () => {
  it("moves preview selection into a compact header trigger and bottom sheet", () => {
    expect(section).toContain('import BottomSheet from "@/features/app/BottomSheet.vue"');
    expect(section).toContain('class="admin-preview-mode-trigger ui-button"');
    expect(section).toContain("Режим: {{ currentPreviewModeLabel }}");
    expect(section).toContain('class="admin-preview-mode-sheet ui-responsive-grid"');
    expect(section).toContain('title="Режим просмотра"');
    expect(section).not.toContain('class="admin-preview-switcher"');
    expect(section).toContain("selectPreviewMode(option.value)");
  });

  it("keeps three primary sections visible and moves permitted secondary sections into More", () => {
    expect(section).toContain('const primaryAdminPanelIds: AdminPanel[] = ["statistics", "users", "payments"]');
    expect(section).toContain("const primaryPanels = computed");
    expect(section).toContain("const secondaryPanels = computed");
    expect(section).toContain('class="admin-quick-nav"');
    expect(section).toContain('class="admin-more-trigger admin-tab ui-button"');
    expect(section).toContain('title="Все разделы"');
    expect(section).toContain('v-for="panel in secondaryPanels"');
    expect(section).toContain("selectSecondaryPanel(panel.id)");
    expect(section).toContain(':aria-current="activePanel === panel.id ? \'page\' : undefined"');
  });

  it("keeps the compact navigation reachable and equal-width on mobile", () => {
    expect(styles).toMatch(/\.admin-quick-nav\s*\{[^}]*position:\s*sticky;[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
    expect(styles).toContain(".admin-preview-mode-trigger");
    expect(styles).toContain(".admin-navigation-sheet-grid");
    expect(styles).toContain("min-height: 44px");
  });
});
