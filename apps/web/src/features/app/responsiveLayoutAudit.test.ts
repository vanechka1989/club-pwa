import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const taskNavigation = readFileSync(resolve(__dirname, "taskNavigation.ts"), "utf8");
const adminSection = readFileSync(resolve(__dirname, "../admin/AdminSection.vue"), "utf8");

function latestRule(selector: string) {
  const matches = [...styles.matchAll(/(?<selectors>[^{}]+)\s*\{(?<body>[^{}]*)\}/g)].filter((match) =>
    match.groups?.selectors
      ?.replace(/\/\*[\s\S]*?\*\//g, "")
      ?.split(",")
      .map((candidate) => candidate.trim())
      .includes(selector)
  );
  return matches.at(-1)?.groups?.body ?? "";
}

describe("responsive layout audit contract", () => {
  it("defines one mobile-first page and component token layer", () => {
    expect(styles).toContain("Responsive layout audit 2026");
    expect(styles).toContain("--page-max-width: 768px;");
    expect(styles).toContain("--page-padding: 16px;");
    expect(styles).toContain("--page-padding-compact: 12px;");
    expect(styles).toContain("--section-gap: 24px;");
    expect(styles).toContain("--card-padding: 20px;");
    expect(styles).toContain("--card-radius: 20px;");
    expect(styles).toContain("--control-height: 48px;");
    expect(styles).toContain("--button-height: 48px;");
    expect(styles).toContain("--button-height-large: 52px;");
    expect(styles).toContain("--header-height: 76px;");
    expect(styles).toContain("--bottom-nav-height: 76px;");
    expect(styles).toContain("--bottom-action-height: 72px;");
  });

  it("uses the same constrained page container for app and task screens", () => {
    const appShellRule = latestRule(".app-shell");
    const taskScreenRule = latestRule(".task-screen");

    expect(appShellRule).toContain("max-width: var(--page-max-width)");
    expect(appShellRule).toContain("min-width: 0");
    expect(appShellRule).toContain("padding-inline: var(--page-padding)");
    expect(taskScreenRule).toContain("max-width: var(--page-max-width)");
    expect(taskScreenRule).toContain("min-width: 0");
    expect(taskScreenRule).toContain("overflow: visible");
  });

  it("keeps routed task screens on one vertical scroll surface", () => {
    const layerRule = latestRule(".task-screen-route-layer");
    const bodyRule = latestRule(".task-screen-body");
    const footerRule = latestRule(".task-screen-footer");

    expect(layerRule).toContain("overflow-y: auto");
    expect(layerRule).not.toContain("overflow: hidden");
    expect(bodyRule).toContain("overflow: visible");
    expect(bodyRule).not.toContain("overflow-y: auto");
    expect(footerRule).toContain("position: sticky");
    expect(footerRule).toContain("bottom: 0");
  });

  it("uses approved task route paths in admin open and sync handlers", () => {
    expect(taskNavigation).toContain('"/admin/storage/files"');
    expect(taskNavigation).toContain('"/admin/storage/folders/:folderId"');
    expect(taskNavigation).toContain('"/admin/server/logs"');
    expect(taskNavigation).toContain('"/admin/admins/:adminId/access"');
    expect(taskNavigation).toContain('"/admin/statistics/payments/:segment"');
    expect(taskNavigation).toContain('"/admin/statistics/users/:segment"');
    expect(adminSection).toContain('openAdminTask("/admin/storage/files")');
    expect(adminSection).toContain('openAdminTask("/admin/server/logs")');
    expect(adminSection).toContain("`/admin/admins/${admin.id}/access`");
    expect(adminSection).toContain("`/admin/storage/folders/${encodeURIComponent(folder.value || \"all\")}`");
    expect(adminSection).toContain("`/admin/statistics/payments/${item.key}`");
    expect(adminSection).toContain("`/admin/statistics/users/access-${item.key}`");
    expect(adminSection).toContain("`/admin/statistics/users/tariff-${encodeURIComponent(tariff.tariff)}`");
    expect(adminSection).toContain('path === "/admin/storage/files"');
    expect(adminSection).toContain('path === "/admin/server/logs"');
    expect(adminSection).toContain("/^\\/admin\\/admins\\/([^/]+)\\/access$/");
    expect(adminSection).toContain("/^\\/admin\\/storage\\/folders\\/([^/]+)$/");
    expect(adminSection).toContain("/^\\/admin\\/statistics\\/payments\\/([^/]+)$/");
    expect(adminSection).toContain("/^\\/admin\\/statistics\\/users\\/([^/]+)$/");
  });
});
