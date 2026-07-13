import { describe, expect, it } from "vitest";
import type { MailingAudienceUser } from "./audience";
import { filterMailingAudience } from "./audience";

function user(overrides: Partial<MailingAudienceUser>): MailingAudienceUser {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    telegramId: overrides.telegramId ?? "1",
    email: Object.prototype.hasOwnProperty.call(overrides, "email") ? overrides.email ?? null : "member@example.com",
    marketingEmailOptOutAt: overrides.marketingEmailOptOutAt ?? null,
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
  it("does not use Telegram bot status for push or email audience", () => {
    const audience = filterMailingAudience(
      [
        user({ id: "active", telegramId: "100", telegramBotStatus: "active" }),
        user({ id: "blocked", telegramId: "200", telegramBotStatus: "blocked" })
      ],
      { accessStatus: "active", accessType: "all", excludeAdmins: true, excludeRestricted: true }
    );

    expect(audience.recipients.map((entry) => entry.telegramId)).toEqual(["100", "200"]);
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

  it("deduplicates recipients by user id instead of Telegram id", () => {
    const audience = filterMailingAudience(
      [
        user({ id: "first", telegramId: "100" }),
        user({ id: "first", telegramId: "100" }),
        user({ id: "second", telegramId: "200" })
      ],
      { accessStatus: "active", accessType: "all", excludeAdmins: true, excludeRestricted: true }
    );

    expect(audience.recipients.map((entry) => entry.telegramId)).toEqual(["100", "200"]);
  });

  it("reports email availability and opt-outs separately", () => {
    const audience = filterMailingAudience(
      [
        user({ id: "eligible", email: "ok@example.com" }),
        user({ id: "missing", email: null }),
        user({ id: "opted-out", email: "no@example.com", marketingEmailOptOutAt: "2026-07-13T10:00:00.000Z" })
      ],
      { accessStatus: "active", accessType: "all", excludeAdmins: true, excludeRestricted: true }
    );

    expect(audience.emailRecipients.map((entry) => entry.id)).toEqual(["eligible"]);
    expect(audience.excludedMissingEmail).toBe(1);
    expect(audience.excludedEmailOptOut).toBe(1);
  });
});
