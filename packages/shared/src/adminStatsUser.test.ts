import { describe, expect, it } from "vitest";
import { adminStatsUserSchema } from "./index";

describe("admin stats user schema", () => {
  it("keeps Telegram bot delivery status fields", () => {
    const parsed = adminStatsUserSchema.parse({
      id: "user-1",
      telegramId: "593677751",
      firstName: "Ivan",
      username: "ivan",
      photoUrl: null,
      role: "member",
      membershipStatus: "active",
      membershipExpiresAt: null,
      tariff: null,
      hasRestrictions: false,
      completedItems: 0,
      totalItems: 3,
      lastOpenedItemTitle: null,
      lastOpenedAt: null,
      lastLoginAt: "2026-06-29T12:00:00.000Z",
      telegramBotStatus: "blocked",
      telegramBotBlockedAt: "2026-06-29T12:20:00.000Z",
      telegramBotUnblockedAt: null,
      createdAt: "2026-06-29T11:00:00.000Z"
    });

    expect(parsed.telegramBotStatus).toBe("blocked");
    expect(parsed.telegramBotBlockedAt).toBe("2026-06-29T12:20:00.000Z");
    expect(parsed.telegramBotUnblockedAt).toBeNull();
  });
});
