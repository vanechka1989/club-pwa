import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "adminRoute.css"), "utf8");

describe("compact admin navigation", () => {
  it("keeps preview selection beside the version in an anchored menu", () => {
    expect(section).not.toContain('import BottomSheet from "@/features/app/BottomSheet.vue"');
    expect(section).not.toContain("<BottomSheet");
    expect(section).toContain('class="admin-version-meta"');
    expect(section).toContain('class="admin-preview-mode-trigger ui-button"');
    expect(section).toContain('{{ currentPreviewModeLabel }}');
    expect(section).toContain('class="admin-preview-mode-menu"');
    expect(section).toContain('role="menu"');
    expect(section).toContain('aria-haspopup="menu"');
    expect(section).toContain(':aria-expanded="openAdminPopover === \'preview\'"');
    expect(section).not.toContain('class="admin-preview-switcher"');
    expect(section).toContain("selectPreviewMode(option.value)");
  });

  it("keeps three primary sections visible and moves permitted secondary sections into More", () => {
    expect(section).toContain('const primaryAdminPanelIds: AdminPanel[] = ["statistics", "users", "payments"]');
    expect(section).toContain("const primaryPanels = computed");
    expect(section).toContain("const secondaryPanels = computed");
    expect(section).toContain('class="admin-quick-nav-shell"');
    expect(section).toContain('class="admin-quick-nav ui-responsive-grid"');
    expect(section).toContain('class="admin-more-trigger admin-tab ui-button"');
    expect(section).toContain('class="admin-navigation-menu"');
    expect(section).toContain('v-for="panel in secondaryPanels"');
    expect(section).toContain("selectSecondaryPanel(panel.id)");
    expect(section).toContain(':aria-current="activePanel === panel.id ? \'page\' : undefined"');
    expect(section).toContain(':aria-expanded="openAdminPopover === \'navigation\'"');
    expect(section).toContain("toggleAdminPopover('navigation')");
  });

  it("keeps both overlay menus viewport-safe without changing page flow", () => {
    expect(styles).toMatch(/\.admin-quick-nav-shell\s*\{[^}]*position:\s*sticky;/s);
    expect(styles).toMatch(/\.admin-quick-nav\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s);
    expect(styles).toContain(".admin-preview-mode-trigger");
    expect(styles).toMatch(/\.admin-preview-mode-menu\s*\{[^}]*position:\s*absolute;/s);
    expect(styles).toMatch(/\.admin-navigation-menu\s*\{[^}]*position:\s*absolute;/s);
    expect(styles).toContain("width: min(320px, calc(100vw - 32px));");
    expect(styles).toContain("min-height: 44px");
  });

  it("closes popovers on outside interaction, Escape, selection, and route change", () => {
    expect(section).toContain('const openAdminPopover = ref<"preview" | "navigation" | null>(null)');
    expect(section).toContain("function toggleAdminPopover");
    expect(section).toContain("function closeAdminPopovers");
    expect(section).toContain('event.key === "Escape"');
    expect(section).toContain('document.addEventListener("pointerdown"');
    expect(section).toContain('document.addEventListener("keydown"');
    expect(section).toContain("closeAdminPopovers();\n  selectAdminPanel(panel);");
    expect(section).toContain("() => route.path");
  });
});
