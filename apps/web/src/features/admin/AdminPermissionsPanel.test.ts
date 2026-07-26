import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminActionActor, AdminPermission, AdminStatsUser, AdminUser } from "@club/shared";
import AdminPermissionsPanel from "./AdminPermissionsPanel.vue";

const administrator: AdminUser = {
  id: "admin-1",
  telegramId: "1001",
  firstName: "Мария",
  username: "maria",
  photoUrl: null,
  roleLabel: null,
  isActive: true,
  permissions: ["community"],
  createdAt: "2026-07-27T00:00:00.000Z"
};

const candidate: AdminStatsUser = {
  id: "client-1",
  telegramId: "2002",
  firstName: "Анна",
  username: "anna",
  photoUrl: null,
  role: "member",
  membershipStatus: "active",
  membershipExpiresAt: null,
  hasRestrictions: false,
  tariff: null,
  completedItems: 0,
  totalItems: 0,
  lastOpenedItemTitle: null,
  lastOpenedAt: null,
  lastLoginAt: "2026-07-27T00:00:00.000Z",
  telegramBotStatus: "unknown",
  telegramBotBlockedAt: null,
  telegramBotUnblockedAt: null,
  createdAt: "2026-07-27T00:00:00.000Z"
};

const permissionOptions: ReadonlyArray<{ value: AdminPermission; label: string }> = [
  { value: "community", label: "Сообщество" },
  { value: "materials", label: "Уроки" }
];

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    ownerTelegramId: "999",
    currentUserTelegramId: "999",
    isOwner: true,
    admins: [administrator],
    adminSearchQuery: "",
    resolvedAdminSearchTelegramId: "",
    adminSearchCandidates: [candidate],
    showTransferOwnerModal: false,
    transferOwnerTelegramId: "1001",
    selectedAdminAccess: administrator,
    adminPermissionOptions: permissionOptions,
    saving: false,
    adminActionLogs: [],
    visibleAdminActionActors: [] as AdminActionActor[],
    adminActionActors: [] as AdminActionActor[],
    adminActionActorFilter: "",
    adminActionLogExpanded: false,
    formatDateTime: () => "27.07.2026",
    ...overrides
  };
}

describe("AdminPermissionsPanel", () => {
  afterEach(cleanup);

  it("emits a new access patch without mutating the administrator prop", async () => {
    const props = createProps();
    const { emitted } = render(AdminPermissionsPanel, { props });

    await fireEvent.click(screen.getByRole("checkbox", { name: "Уроки" }));

    expect(props.admins[0]!.permissions).toEqual(["community"]);
    expect(emitted()["update-access"]).toEqual([[administrator, { permissions: ["community", "materials"] }]]);
  });

  it("emits owner transfer and access back intents from routed task screens", async () => {
    const { emitted, rerender } = render(AdminPermissionsPanel, { props: createProps({ showTransferOwnerModal: true, selectedAdminAccess: null }) });

    await fireEvent.submit(screen.getByRole("button", { name: "Подтвердить передачу" }).closest("form")!);
    expect(emitted()["request-transfer-confirmation"]).toEqual([["1001"]]);

    await rerender(createProps());
    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(emitted().back).toEqual([["access"]]);
  });
});
