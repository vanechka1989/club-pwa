import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const apiClientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");

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
});
