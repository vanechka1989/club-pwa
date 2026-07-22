import { describe, expect, it } from "vitest";
import type { AdminStatsUser } from "@club/shared";
import {
  allClientSourcesFilter,
  filterAdminClients,
  getAdminClientSourceOptions,
  untaggedClientSourceFilter
} from "./adminClientAcquisitionFilters";

function client(overrides: Partial<AdminStatsUser>): AdminStatsUser {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    telegramId: overrides.telegramId ?? "100",
    email: null,
    firstName: "Иван",
    username: "ivan",
    displayName: null,
    displayNameChangedByUserAt: null,
    photoUrl: null,
    role: "member",
    membershipStatus: "active",
    membershipExpiresAt: null,
    tariff: "manual",
    hasRestrictions: false,
    completedItems: 0,
    totalItems: 0,
    lastOpenedItemTitle: null,
    lastOpenedAt: null,
    lastLoginAt: "2026-07-22T00:00:00.000Z",
    telegramBotStatus: "unknown",
    telegramBotBlockedAt: null,
    telegramBotUnblockedAt: null,
    acquisition: null,
    createdAt: "2026-07-22T00:00:00.000Z",
    ...overrides
  };
}

const baseFilters = {
  query: "",
  subscription: "all" as const,
  tariff: "all",
  restrictions: "all" as const,
  source: allClientSourcesFilter,
  utmField: "all" as const,
  utmValue: ""
};

describe("admin client acquisition filters", () => {
  const users = [
    client({ id: "vk", acquisition: { source: "vk", medium: "cpc", campaign: "Summer Sale", content: "story-a" } }),
    client({ id: "email", acquisition: { source: "email", medium: "newsletter", campaign: "welcome", content: null } }),
    client({ id: "direct", acquisition: null })
  ];

  it("filters by source and supports clients without a tag", () => {
    expect(filterAdminClients(users, { ...baseFilters, source: "vk" }).map((user) => user.id)).toEqual(["vk"]);
    expect(filterAdminClients(users, { ...baseFilters, source: untaggedClientSourceFilter }).map((user) => user.id)).toEqual(["direct"]);
  });

  it("searches case-insensitively across all UTM values or one selected field", () => {
    expect(filterAdminClients(users, { ...baseFilters, utmValue: "SUMMER" }).map((user) => user.id)).toEqual(["vk"]);
    expect(filterAdminClients(users, { ...baseFilters, utmField: "campaign", utmValue: "cpc" })).toEqual([]);
  });

  it("combines acquisition filters with existing client filters", () => {
    const restricted = client({
      id: "restricted",
      firstName: "Анна",
      membershipStatus: "expired",
      tariff: "cloudpayments",
      hasRestrictions: true,
      acquisition: { source: "vk", medium: "social", campaign: "summer", content: null }
    });
    const result = filterAdminClients([...users, restricted], {
      ...baseFilters,
      query: "анна",
      subscription: "closed",
      tariff: "cloudpayments",
      restrictions: "restricted",
      source: "vk"
    });
    expect(result.map((user) => user.id)).toEqual(["restricted"]);
  });

  it("returns unique sorted source options", () => {
    expect(getAdminClientSourceOptions([...users, client({ acquisition: { source: "VK", medium: "cpc", campaign: "other", content: null } })])).toEqual([
      { value: "email", label: "email" },
      { value: "vk", label: "vk" }
    ]);
  });
});
