import { describe, expect, it } from "vitest";
import { selectSupportAdminTelegramIds } from "./adminNotificationRecipients";

describe("support admin notification recipients", () => {
  it("keeps only the owner and active admins with the support permission", () => {
    expect(
      selectSupportAdminTelegramIds({
        ownerTelegramId: "owner@example.com",
        admins: [
          {
            telegramId: "support@example.com",
            isActive: true,
            permissions: ["support"]
          },
          {
            telegramId: "inactive@example.com",
            isActive: false,
            permissions: ["support"]
          },
          {
            telegramId: "billing@example.com",
            isActive: true,
            permissions: ["payments"]
          },
          {
            telegramId: "malformed@example.com",
            isActive: true,
            permissions: { support: true }
          },
          {
            telegramId: "OWNER@example.com",
            isActive: true,
            permissions: ["support"]
          }
        ]
      })
    ).toEqual(["owner@example.com", "support@example.com"]);
  });
});
