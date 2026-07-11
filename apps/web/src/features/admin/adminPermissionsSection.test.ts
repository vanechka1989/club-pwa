import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const sharedSource = readFileSync(resolve(__dirname, "../../../../../packages/shared/src/index.ts"), "utf-8");
const adminRouteSource = readFileSync(resolve(__dirname, "../../../../../apps/api/src/routes/admin.ts"), "utf-8");

function indexOfClass(source: string, className: string) {
  return source.match(new RegExp(`class="[^"]*\\b${className}\\b`))?.index ?? -1;
}

describe("admin permissions section", () => {
  it("supports searching admins by email, name, or username before adding access", () => {
    expect(adminSectionSource).toContain("adminSearchQuery");
    expect(adminSectionSource).toContain("adminSearchCandidates");
    expect(adminSectionSource).toContain("email, имя или username");
  });

  it("renders manual role label, access toggle, and permission switches", () => {
    expect(adminSectionSource).toContain("Роль вручную");
    expect(adminSectionSource).toContain("Доступ администратора");
    expect(adminSectionSource).toContain("adminPermissionOptions");
    expect(adminSectionSource).toContain("toggleAdminPermission");
    expect(adminSectionSource).toContain("handleUpdateAdminAccess");
  });

  it("has a separate admin permission for granting client access", () => {
    expect(sharedSource).toContain('"accesses"');
    expect(sharedSource).toContain('accesses: "Доступы"');
    expect(adminRouteSource).toContain('.use("/access", requireAdminPermission("accesses"))');
    expect(adminSectionSource).toContain("canGrantClientAccess");
    expect(adminSectionSource).toContain("Для выдачи доступа нужно право Доступы.");
  });

  it("places preview mode switcher in the admin header, not inside the admins section", () => {
    const adminTitleIndex = adminSectionSource.indexOf('<h2 class="section-title">Админка</h2>');
    const tabsIndex = indexOfClass(adminSectionSource, "admin-tabs");
    const adminsTitleIndex = adminSectionSource.indexOf("<h3>Администраторы</h3>");
    const previewSwitcherIndex = indexOfClass(adminSectionSource, "admin-preview-switcher");
    const versionBadgeIndex = indexOfClass(adminSectionSource, "app-version-badge");
    const ownerCardIndex = indexOfClass(adminSectionSource, "admin-permissions-owner");

    expect(adminTitleIndex).toBeGreaterThan(-1);
    expect(adminsTitleIndex).toBeGreaterThan(-1);
    expect(versionBadgeIndex).toBeGreaterThan(adminTitleIndex);
    expect(versionBadgeIndex).toBeLessThan(previewSwitcherIndex);
    expect(previewSwitcherIndex).toBeGreaterThan(adminTitleIndex);
    expect(previewSwitcherIndex).toBeLessThan(tabsIndex);
    expect(previewSwitcherIndex).toBeLessThan(adminsTitleIndex);
    expect(ownerCardIndex).toBeGreaterThan(adminsTitleIndex);
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
    expect(adminSectionSource).toContain("admin-permission-row-button");
    expect(adminSectionSource).toContain("admin-permission-modal");
    expect(adminSectionSource).toContain("`/admin/admins/${admin.id}/access`");
    expect(adminSectionSource).toContain("<TaskScreen");
    expect(adminSectionSource).not.toContain('aria-modal="true"');
  });

  it("has API client support for updating admin permissions", () => {
    expect(apiClientSource).toContain("updateAdminUserPermissions");
    expect(apiClientSource).toContain("`/admin/admins/${telegramId}`");
  });

  it("shows admin action journal with filtering by admin", () => {
    expect(apiClientSource).toContain("getAdminActionLogs");
    expect(apiClientSource).toContain("actorTelegramId");
    expect(adminSectionSource).toContain("adminActionActorFilter");
    expect(adminSectionSource).toContain("Журнал действий");
    expect(adminSectionSource).toContain("Все администраторы");
  });

  it("shows understandable server errors in a dedicated server logs panel with auto refresh", () => {
    expect(apiClientSource).toContain("getAdminServerErrors");
    expect(apiClientSource).toContain("getAdminServerStatus");
    expect(adminSectionSource).toContain("activePanel === 'server-logs'");
    expect(adminSectionSource).toContain("serverErrorLogs");
    expect(adminSectionSource).toContain("serverStatus");
    expect(adminSectionSource).toContain("Сервер");
    expect(adminSectionSource).toContain("Логи сервера");
    expect(adminSectionSource).toContain("Открыть логи");
    expect(adminSectionSource).toContain("Доступно разработчику");
    expect(adminSectionSource).toContain("Здесь не Docker-логи");
    expect(adminSectionSource).toContain("последние 100 ошибок");
    expect(adminSectionSource).toContain("serverLogsRefreshTimer");
    expect(adminSectionSource).toContain("window.setInterval");
  });

  it("offers owner-only manual database backup and restore from the server panel", () => {
    expect(apiClientSource).toContain("downloadAdminDatabaseBackup");
    expect(apiClientSource).toContain("createAdminDatabaseBackupDownloadLink");
    expect(apiClientSource).toContain("restoreAdminDatabaseBackup");
    expect(adminRouteSource).toContain(".get(\"/database/backup\"");
    expect(adminRouteSource).toContain(".post(\"/database/backup-link\"");
    expect(adminRouteSource).toContain(".get(\"/database/backup-download/:token\"");
    expect(adminRouteSource).toContain(".post(\"/database/restore\"");
    expect(adminSectionSource).toContain("openDatabaseBackupDownloadUrl");
    expect(adminSectionSource).toContain('window.open(url, "_blank", "noopener,noreferrer")');
    expect(adminSectionSource).toContain("Скачать базу");
    expect(adminSectionSource).toContain("Восстановить базу");
    expect(adminSectionSource).toContain("ВОССТАНОВИТЬ");
    expect(adminSectionSource).toContain("databaseRestoreFile");
  });

  it("shows release notes in the admin section only to the developer mode", () => {
    expect(adminSectionSource).toContain("canViewReleaseNotes");
    expect(adminSectionSource).toContain('ui.previewMode === "developer"');
    expect(adminSectionSource).toContain('v-if="canViewReleaseNotes"');
    expect(adminSectionSource).toContain('v-if="showReleaseNotesModal && canViewReleaseNotes"');
    expect(adminSectionSource).toContain('openAdminTask("/admin/releases")');
  });

  it("keeps action journal collapsed by default and can expand it", () => {
    expect(adminSectionSource).toContain("adminActionLogExpanded");
    expect(adminSectionSource).toContain("Показать журнал");
    expect(adminSectionSource).toContain("Свернуть журнал");
  });

  it("shows pending feedback on client access action buttons", () => {
    expect(adminSectionSource).toContain("pendingClientAccessAction");
    expect(adminSectionSource).toContain("admin-access-button-pending");
    expect(adminSectionSource).toContain("Открываю...");
    expect(adminSectionSource).toContain("Закрываю...");
  });

  it("allows choosing a custom statistics period", () => {
    expect(adminSectionSource).toContain("Выбрать период");
    expect(adminSectionSource).toContain("statisticsCustomFrom");
    expect(adminSectionSource).toContain("statisticsCustomTo");
    expect(adminSectionSource).toContain("statisticsPeriod === 'custom'");
  });
});
