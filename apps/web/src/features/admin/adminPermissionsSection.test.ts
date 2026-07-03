import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");
const sharedSource = readFileSync(resolve(__dirname, "../../../../../packages/shared/src/index.ts"), "utf-8");
const adminRouteSource = readFileSync(resolve(__dirname, "../../../../../apps/api/src/routes/admin.ts"), "utf-8");

describe("admin permissions section", () => {
  it("supports searching admins by id, name, or username before adding access", () => {
    expect(adminSectionSource).toContain("adminSearchQuery");
    expect(adminSectionSource).toContain("adminSearchCandidates");
    expect(adminSectionSource).toContain("Telegram ID, имя или username");
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

  it("places preview mode switcher inside the admins section", () => {
    const adminsTitleIndex = adminSectionSource.indexOf("<h3>Администраторы</h3>");
    const previewSwitcherIndex = adminSectionSource.indexOf('class="admin-preview-switcher"');
    const ownerCardIndex = adminSectionSource.indexOf('class="admin-permissions-owner"');

    expect(adminsTitleIndex).toBeGreaterThan(-1);
    expect(previewSwitcherIndex).toBeGreaterThan(adminsTitleIndex);
    expect(previewSwitcherIndex).toBeLessThan(ownerCardIndex);
  });

  it("keeps the admin list compact and opens permissions in a modal", () => {
    expect(adminSectionSource).toContain("selectedAdminAccess");
    expect(adminSectionSource).toContain("openAdminAccessModal");
    expect(adminSectionSource).toContain("admin-permission-row-button");
    expect(adminSectionSource).toContain("admin-permission-modal");
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
    expect(apiClientSource).toContain("restoreAdminDatabaseBackup");
    expect(adminRouteSource).toContain(".get(\"/database/backup\"");
    expect(adminRouteSource).toContain(".post(\"/database/restore\"");
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
