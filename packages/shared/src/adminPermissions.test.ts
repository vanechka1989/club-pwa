import { describe, expect, it } from "vitest";
import { adminListResponseSchema, allAdminPermissions, clubUserSchema, newAdminDefaultPermissions } from "./index";

describe("admin permissions contracts", () => {
  it("starts newly added admins without section permissions", () => {
    expect(newAdminDefaultPermissions).toEqual([]);
  });

  it("exposes active status, custom role label, and permission toggles for admins", () => {
    const parsed = adminListResponseSchema.parse({
      ownerTelegramId: "1",
      admins: [
        {
          id: "admin-1",
          telegramId: "593677751",
          firstName: "Ivan",
          username: "ivan",
          photoUrl: null,
          roleLabel: "Старший модератор",
          isActive: true,
          permissions: allAdminPermissions,
          createdAt: "2026-06-30T01:00:00.000Z"
        }
      ]
    });

    expect(parsed.admins[0]?.roleLabel).toBe("Старший модератор");
    expect(parsed.admins[0]?.isActive).toBe(true);
    expect(parsed.admins[0]?.permissions).toContain("mailings");
  });

  it("returns admin permissions in the current user profile", () => {
    const parsed = clubUserSchema.parse({
      id: "user-1",
      telegramId: "593677751",
      firstName: "Ivan",
      username: "ivan",
      photoUrl: null,
      role: "admin",
      realRole: "admin",
      adminRoleLabel: "Оператор",
      adminPermissions: ["statistics", "users"],
      membershipStatus: "inactive",
      membershipExpiresAt: null,
      paymentType: "none",
      recurrentPaymentStatus: null,
      nextPaymentAt: null,
      avatarRefreshedAt: null
    });

    expect(parsed.adminRoleLabel).toBe("Оператор");
    expect(parsed.adminPermissions).toEqual(["statistics", "users"]);
  });
});
