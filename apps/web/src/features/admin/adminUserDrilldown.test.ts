import type { AdminStatsUser } from "@club/shared";
import { describe, expect, it } from "vitest";
import { filterUsersByAccessBreakdown, filterUsersByTariff } from "./adminUserDrilldown";

const now = new Date("2026-06-26T12:00:00.000Z");

function user(overrides: Partial<AdminStatsUser>): AdminStatsUser {
  return {
    id: "user-id",
    telegramId: "100",
    firstName: null,
    username: null,
    photoUrl: null,
    role: "member",
    membershipStatus: "inactive",
    membershipExpiresAt: null,
    tariff: null,
    hasRestrictions: false,
    completedItems: 0,
    totalItems: 0,
    lastOpenedItemTitle: null,
    lastOpenedAt: null,
    createdAt: "2026-05-01T10:00:00.000Z",
    ...overrides
  };
}

describe("admin user drilldown", () => {
  const users = [
    user({ id: "active-expiring", telegramId: "1", membershipStatus: "active", membershipExpiresAt: "2026-06-30T00:00:00.000Z", tariff: "prodamus_recurrent" }),
    user({ id: "active-later", telegramId: "2", membershipStatus: "active", membershipExpiresAt: "2026-07-20T00:00:00.000Z", tariff: "manual" }),
    user({ id: "restricted", telegramId: "3", membershipStatus: "inactive", hasRestrictions: true, tariff: null }),
    user({ id: "manual-closed", telegramId: "4", membershipStatus: "inactive", tariff: "manual" })
  ];

  it("filters users by access state", () => {
    expect(filterUsersByAccessBreakdown("inactive", users, { now }).map((entry) => entry.id)).toEqual(["restricted", "manual-closed"]);
    expect(filterUsersByAccessBreakdown("restricted", users, { now }).map((entry) => entry.id)).toEqual(["restricted"]);
    expect(filterUsersByAccessBreakdown("expiring_soon", users, { now }).map((entry) => entry.id)).toEqual(["active-expiring"]);
  });

  it("filters users by tariff including empty tariff as future", () => {
    expect(filterUsersByTariff("prodamus_recurrent", users).map((entry) => entry.id)).toEqual(["active-expiring"]);
    expect(filterUsersByTariff("manual", users).map((entry) => entry.id)).toEqual(["active-later"]);
    expect(filterUsersByTariff("future", users).map((entry) => entry.id)).toEqual([]);
  });
});
