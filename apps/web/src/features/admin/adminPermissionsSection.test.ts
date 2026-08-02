import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const clientsPanelSource = readFileSync(resolve(__dirname, "AdminClientsPanel.vue"), "utf-8");
const permissionsPanelSource = readFileSync(resolve(__dirname, "AdminPermissionsPanel.vue"), "utf-8");
const adminServerPanelSource = readFileSync(resolve(__dirname, "AdminServerPanel.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const sharedSource = readFileSync(resolve(__dirname, "../../../../../packages/shared/src/index.ts"), "utf-8");
const adminRouteSource = readFileSync(resolve(__dirname, "../../../../../apps/api/src/routes/admin.ts"), "utf-8");

function indexOfClass(source: string, className: string) {
  return source.match(new RegExp(`class="[^"]*\\b${className}\\b`))?.index ?? -1;
}

describe("admin permissions section", () => {
  it("supports searching admins by email, name, or username before adding access", () => {
    expect(permissionsPanelSource).toContain("adminSearchQuery");
    expect(permissionsPanelSource).toContain("adminSearchCandidates");
    expect(permissionsPanelSource).toContain("email, имя или username");
  });

  it("renders manual role label, access toggle, and permission switches", () => {
    expect(permissionsPanelSource).toContain("Роль вручную");
    expect(permissionsPanelSource).toContain("Доступ администратора");
    expect(permissionsPanelSource).toContain("adminPermissionOptions");
    expect(permissionsPanelSource).toContain("emit(\"update-access\"");
    expect(adminSectionSource).toContain("handleUpdateAdminAccess");
  });

  it("has a separate admin permission for granting client access", () => {
    expect(sharedSource).toContain('"accesses"');
    expect(sharedSource).toContain('accesses: "Доступы"');
    expect(adminRouteSource).toContain('.use("/access", requireAdminPermission("accesses"))');
    expect(adminSectionSource).toContain("canGrantClientAccess");
    expect(clientsPanelSource).toContain("Для выдачи доступа нужно право Доступы.");
  });

  it("places the compact preview mode trigger in the admin header", () => {
    const adminTitleIndex = adminSectionSource.indexOf('<UiPageHeader title="Админка"');
    const tabsIndex = indexOfClass(adminSectionSource, "admin-quick-nav");
    const previewTriggerIndex = indexOfClass(adminSectionSource, "admin-preview-mode-trigger");
    const versionBadgeIndex = indexOfClass(adminSectionSource, "app-version-badge");

    expect(adminTitleIndex).toBeGreaterThan(-1);
    expect(versionBadgeIndex).toBeGreaterThan(adminTitleIndex);
    expect(versionBadgeIndex).toBeLessThan(previewTriggerIndex);
    expect(previewTriggerIndex).toBeGreaterThan(adminTitleIndex);
    expect(previewTriggerIndex).toBeLessThan(tabsIndex);
    expect(adminSectionSource).not.toContain("<h3>Администраторы</h3>");
    expect(permissionsPanelSource).toContain("<h3>Администраторы</h3>");
    expect(indexOfClass(permissionsPanelSource, "admin-permissions-owner")).toBeGreaterThan(-1);
  });

  it("keeps member preview mode visual without surfacing admin API loading errors", () => {
    expect(adminSectionSource).toContain("isMemberPreviewMode");
    expect(adminSectionSource).toContain("clearAdminFeedback");
    expect(adminSectionSource).toContain('mode === "member-active" || mode === "member-inactive"');
    expect(adminSectionSource).toContain("void session.load({ silent: true }).catch(() => null)");
    expect(adminSectionSource).toContain("if (isMemberPreviewMode.value)");
  });

  it("keeps the admin list compact and opens permissions in a routed task screen", () => {
    expect(adminSectionSource).toContain("selectedAdminAccess");
    expect(adminSectionSource).toContain("openAdminAccessModal");
    expect(permissionsPanelSource).toContain("admin-permission-row-button");
    expect(permissionsPanelSource).toContain("admin-permission-surface");
    expect(adminSectionSource).toContain("`/admin/admins/${admin.id}/access`");
    expect(permissionsPanelSource).toContain("<TaskScreen");
    expect(permissionsPanelSource).toContain('class="admin-task-screen"');
  });

  it("lazy-loads the permissions presentation while the shell keeps owner transfer and permission-loss safety", () => {
    expect(adminSectionSource).toContain('defineAsyncComponent(() => import("./AdminPermissionsPanel.vue"))');
    expect(adminSectionSource).toContain('<AdminPermissionsPanel\n      v-else-if="activePanel === \'admins\'"');
    expect(adminSectionSource).toContain('@request-transfer-confirmation="requestTransferOwnerConfirmation"');
    expect(adminSectionSource).toContain('if (ownerTaskDenied || developerTaskDenied || panelTaskDenied)');
    expect(adminSectionSource).toContain('await router.replace("/admin")');
    expect(adminSectionSource).toContain("transferClubOwner(transferOwnerTelegramId.value)");
    expect(permissionsPanelSource).toContain('title="Передать клуб"');
    expect(permissionsPanelSource).toContain('subtitle="Права и доступ администратора"');
  });

  it("uses one clean permission surface and a single-column mobile permission list", () => {
    const styles = ["../../styles.css", "adminRoute.css", "adminShell.css"]
      .map((path) => readFileSync(resolve(__dirname, path), "utf8"))
      .join("\n");

    expect(permissionsPanelSource).toContain('class="admin-permission-surface ui-card"');
    expect(permissionsPanelSource).not.toContain('class="admin-permission-card ui-card"');
    expect(styles).toMatch(/\.admin-permission-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(styles).toMatch(/\.admin-permission-toggle\s*\{[\s\S]*?min-height:\s*44px;/);
    expect(styles).toMatch(/@media \(min-width:\s*600px\)[\s\S]*?\.admin-permission-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it("pins permission switches to a compact size despite global input styles", () => {
    const styles = ["../../styles.css", "adminRoute.css", "adminShell.css"]
      .map((path) => readFileSync(resolve(__dirname, path), "utf8"))
      .join("\n");

    expect(styles).toMatch(/\.admin-permission-surface :is\(\.admin-switch-row, \.admin-permission-toggle\) input\s*\{[\s\S]*?width:\s*44px !important;[\s\S]*?height:\s*24px !important;[\s\S]*?min-height:\s*24px !important;[\s\S]*?max-height:\s*24px !important;/);
    expect(styles).toMatch(/\.admin-permission-surface :is\(\.admin-switch-row, \.admin-permission-toggle\) input::before\s*\{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;/);
  });

  it("saves access changes without green success alerts", () => {
    const updateHandler = adminSectionSource.slice(
      adminSectionSource.indexOf("async function handleUpdateAdminAccess"),
      adminSectionSource.indexOf("async function handleAdminRoleLabelChange")
    );

    expect(updateHandler).not.toContain('setStatus("Права админа сохранены.")');
    expect(updateHandler).toContain('setError("Не удалось сохранить права админа.")');
  });

  it("has API client support for updating admin permissions", () => {
    expect(apiClientSource).toContain("updateAdminUserPermissions");
    expect(apiClientSource).toContain("`/admin/admins/${telegramId}`");
  });

  it("shows admin action journal with filtering by admin", () => {
    expect(apiClientSource).toContain("getAdminActionLogs");
    expect(apiClientSource).toContain("actorTelegramId");
    expect(adminSectionSource).toContain("adminActionActorFilter");
    expect(permissionsPanelSource).toContain("Журнал действий");
    expect(permissionsPanelSource).toContain("Все администраторы");
  });

  it("shows understandable persistent server errors with explicit refresh", () => {
    expect(apiClientSource).toContain("getAdminServerErrors");
    expect(apiClientSource).toContain("getAdminServerStatus");
    expect(adminSectionSource).toContain("AdminServerPanel");
    expect(adminServerPanelSource).toContain("Сервер и интеграции");
    expect(adminServerPanelSource).toContain("Ошибки API");
    expect(adminServerPanelSource).toContain("сохраняются между перезапусками");
    expect(adminServerPanelSource).toContain('@click="load"');
    expect(adminServerPanelSource).toContain("onMounted(load)");
  });

  it("offers owner-only manual database backup and restore from the server panel", () => {
    expect(apiClientSource).toContain("downloadAdminDatabaseBackup");
    expect(apiClientSource).toContain("createAdminDatabaseBackupDownloadLink");
    expect(apiClientSource).toContain("restoreAdminDatabaseBackup");
    expect(adminRouteSource).toContain(".get(\"/database/backup\"");
    expect(adminRouteSource).toContain(".post(\"/database/backup-link\"");
    expect(adminRouteSource).toContain(".get(\"/database/backup-download/:token\"");
    expect(adminRouteSource).toContain(".post(\"/database/restore\"");
    expect(adminServerPanelSource).toContain("createAdminDatabaseBackupDownloadLink");
    expect(adminServerPanelSource).toContain("window.location.assign(link.url)");
    expect(adminServerPanelSource).toContain("Скачать резервную копию");
    expect(adminServerPanelSource).toContain("Восстановить");
    expect(adminServerPanelSource).toContain("ВОССТАНОВИТЬ");
    expect(adminServerPanelSource).toContain("restoreFile");
  });

  it("shows release notes in the admin section only to the developer mode", () => {
    expect(adminSectionSource).toContain("canViewReleaseNotes");
    expect(adminSectionSource).toContain("canUseDeveloperPreview(session.user?.realRole, ui.previewMode)");
    expect(adminSectionSource).toContain("normalizeAdminPreviewMode(realRole, previewMode)");
    expect(adminSectionSource).toContain('v-if="canViewReleaseNotes"');
    expect(adminSectionSource).toContain("(showReleaseNotesModal || route.path === '/admin/releases') && canViewReleaseNotes");
    expect(adminSectionSource).toContain('openAdminTask("/admin/releases")');
  });

  it("keeps action journal collapsed by default and can expand it", () => {
    expect(adminSectionSource).toContain("adminActionLogExpanded");
    expect(permissionsPanelSource).toContain("Показать журнал");
    expect(permissionsPanelSource).toContain("Свернуть журнал");
  });

  it("shows pending feedback on client access action buttons", () => {
    expect(adminSectionSource).toContain("pendingClientAccessAction");
    expect(clientsPanelSource).toContain("admin-access-button-pending");
    expect(clientsPanelSource).toContain("Открываю...");
    expect(clientsPanelSource).toContain("Закрываю...");
  });

  it("allows choosing a custom statistics period", () => {
    expect(adminSectionSource).toContain('{ value: "custom", label: "Период" }');
    expect(adminSectionSource).toContain("statisticsCustomFrom");
    expect(adminSectionSource).toContain("statisticsCustomTo");
    expect(adminSectionSource).toContain("statisticsPeriod === 'custom'");
  });
});
