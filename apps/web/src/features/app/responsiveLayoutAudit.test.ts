import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const taskNavigation = readFileSync(resolve(__dirname, "taskNavigation.ts"), "utf8");
const adminSection = readFileSync(resolve(__dirname, "../admin/AdminSection.vue"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");
const taskScreenSource = readFileSync(resolve(__dirname, "TaskScreen.vue"), "utf8");
const foundationPath = resolve(__dirname, "../ui/foundation.css");
const profileSource = readFileSync(resolve(__dirname, "../profile/ProfileSection.vue"), "utf8");
const learningSource = readFileSync(resolve(__dirname, "../learning/LearningSection.vue"), "utf8");
const communitySource = readFileSync(resolve(__dirname, "../community/CommunitySection.vue"), "utf8");
const paymentsSource = readFileSync(resolve(__dirname, "../billing/PaymentsSection.vue"), "utf8");
const supportSource = readFileSync(resolve(__dirname, "../support/SupportSection.vue"), "utf8");
const notificationSource = readFileSync(resolve(__dirname, "NotificationCenterScreen.vue"), "utf8");

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
    expect(existsSync(foundationPath)).toBe(true);
    const foundation = readFileSync(foundationPath, "utf8");
    expect(foundation).toContain("PWA UI Foundation 2026");
    expect(foundation).toContain("--page-max-width: 768px;");
    expect(foundation).toContain("--page-padding: 16px;");
    expect(foundation).toContain("--page-padding-compact: 12px;");
    expect(foundation).toContain("--section-gap: 24px;");
    expect(foundation).toContain("--card-padding: 20px;");
    expect(foundation).toContain("--card-radius: 20px;");
    expect(foundation).toContain("--control-height: 48px;");
    expect(foundation).toContain("--button-height: 48px;");
    expect(foundation).toContain("--button-height-large: 52px;");
    expect(foundation).toContain("--icon-button-size: 52px;");
    expect(foundation).toContain("--bottom-nav-height: 76px;");
    expect(foundation).toContain("--bottom-action-height: 72px;");
  });

  it("uses the same constrained page container for app and task screens", () => {
    expect(existsSync(foundationPath)).toBe(true);
    const foundation = readFileSync(foundationPath, "utf8");
    const pageContainerRule = [...foundation.matchAll(/(?<selectors>[^{}]+)\s*\{(?<body>[^{}]*)\}/g)].find((match) =>
      match.groups?.selectors
        ?.split(",")
        .map((candidate) => candidate.trim())
        .includes(".ui-page-container")
    )?.groups?.body ?? "";

    expect(pageContainerRule).toContain("max-width: var(--page-max-width)");
    expect(pageContainerRule).toContain("min-width: 0");
    expect(pageContainerRule).toContain("padding-inline: var(--page-padding)");
    expect(appSource).toContain("ui-app-shell");
    expect(appSource).toContain("ui-page-container");
    expect(taskScreenSource).toContain("UiPageContainer");
    expect(taskScreenSource).toContain("UiPageHeader");
  });

  it("keeps routed task screens on one vertical scroll surface", () => {
    expect(existsSync(foundationPath)).toBe(true);
    const foundation = readFileSync(foundationPath, "utf8");
    const layerRule = latestRule(".task-screen-route-layer");
    const bodyRule = [...foundation.matchAll(/(?<selectors>[^{}]+)\s*\{(?<body>[^{}]*)\}/g)].find((match) =>
      match.groups?.selectors
        ?.split(",")
        .map((candidate) => candidate.trim())
        .includes(".ui-page-content")
    )?.groups?.body ?? "";
    const footerRule = [...foundation.matchAll(/(?<selectors>[^{}]+)\s*\{(?<body>[^{}]*)\}/g)].find((match) =>
      match.groups?.selectors
        ?.split(",")
        .map((candidate) => candidate.trim())
        .includes(".ui-bottom-action-bar")
    )?.groups?.body ?? "";

    expect(layerRule).toContain("overflow-y: auto");
    expect(layerRule).not.toContain("overflow: hidden");
    expect(bodyRule).toContain("overflow: visible");
    expect(bodyRule).not.toContain("overflow-y: auto");
    expect(footerRule).toContain("position: sticky");
    expect(footerRule).toContain("bottom: 0");
    expect(taskScreenSource).toContain("UiBottomActionBar");
  });

  it("migrates user-facing sections onto foundation classes", () => {
    expect(profileSource).toContain("ui-page-section");
    expect(profileSource).toContain("ui-page-header");
    expect(profileSource).toContain("ui-card");
    expect(profileSource).toContain("ui-icon-button");

    expect(learningSource).toContain("ui-page-section");
    expect(learningSource).toContain("ui-card");
    expect(learningSource).toContain("ui-icon-button");

    expect(communitySource).toContain("ui-page-section");
    expect(communitySource).toContain("ui-page-header");
    expect(communitySource).toContain("ui-card");
    expect(communitySource).toContain("ui-icon-button");

    expect(paymentsSource).toContain("ui-page-section");
    expect(paymentsSource).toContain("ui-page-header");
    expect(paymentsSource).toContain("ui-card");
    expect(paymentsSource).toContain("ui-button");
    expect(paymentsSource).toContain("ui-icon-button");

    expect(supportSource).toContain("ui-page-section");
    expect(supportSource).toContain("ui-page-header");
    expect(supportSource).toContain("ui-card");
    expect(supportSource).toContain("ui-button-group");

    expect(notificationSource).toContain("ui-card");
    expect(notificationSource).toContain("ui-icon-button");
  });

  it("migrates admin surfaces onto foundation classes", () => {
    expect(adminSection).toContain("ui-page-section");
    expect(adminSection).toContain("ui-page-header");
    expect(adminSection).toContain("ui-card");
    expect(adminSection).toContain("ui-button");
    expect(adminSection).toContain("ui-icon-button");
    expect(adminSection).toContain("ui-responsive-grid");
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
