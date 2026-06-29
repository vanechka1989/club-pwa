import { describe, expect, it } from "vitest";
import type { MailingAudienceUser } from "./audience";
import { filterMailingAudience } from "./audience";

function user(overrides: Partial<MailingAudienceUser>): MailingAudienceUser {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    telegramId: overrides.telegramId ?? "1",
    role: overrides.role ?? "member",
    membershipStatus: overrides.membershipStatus ?? "active",
    tariff: overrides.tariff ?? "manual",
    hasRestrictions: overrides.hasRestrictions ?? false,
    lastLoginAt: overrides.lastLoginAt ?? "2026-06-29T10:00:00.000Z",
    lastOpenedAt: overrides.lastOpenedAt ?? null,
    telegramBotStatus: overrides.telegramBotStatus ?? "active",
    createdAt: overrides.createdAt ?? "2026-06-01T10:00:00.000Z"
  };
}

describe("mailing audience filtering", () => {
  it("always excludes users who blocked the bot from the final recipients", () => {
    const audience = filterMailingAudience(
      [
        user({ id: "active", telegramId: "100", telegramBotStatus: "active" }),
        user({ id: "blocked", telegramId: "200", telegramBotStatus: "blocked" })
      ],
      { accessStatus: "active", accessType: "all", excludeAdmins: true, excludeRestricted: true }
    );

    expect(audience.recipients.map((entry) => entry.telegramId)).toEqual(["100"]);
    expect(audience.excludedBotBlocked).toBe(1);
  });

  it("separates access status from access type", () => {
    const audience = filterMailingAudience(
      [
        user({ id: "manual-active", telegramId: "1", membershipStatus: "active", tariff: "manual" }),
        user({ id: "recurrent-active", telegramId: "2", membershipStatus: "active", tariff: "prodamus_recurrent" }),
        user({ id: "manual-closed", telegramId: "3", membershipStatus: "inactive", tariff: "manual" })
      ],
      { accessStatus: "active", accessType: "manual", excludeAdmins: true, excludeRestricted: true }
    );

    expect(audience.recipients.map((entry) => entry.telegramId)).toEqual(["1"]);
    expect(audience.excludedByFilters).toBe(2);
  });

  it("deduplicates recipients by Telegram id", () => {
    const audience = filterMailingAudience(
      [
        user({ id: "first", telegramId: "100" }),
        user({ id: "duplicate", telegramId: "100" }),
        user({ id: "second", telegramId: "200" })
      ],
      { accessStatus: "active", accessType: "all", excludeAdmins: true, excludeRestricted: true }
    );

    expect(audience.recipients.map((entry) => entry.telegramId)).toEqual(["100", "200"]);
  });
});
