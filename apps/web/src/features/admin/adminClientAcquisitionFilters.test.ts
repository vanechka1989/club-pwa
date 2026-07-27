import { describe, expect, it } from "vitest";
import type { AdminStatsUser } from "@club/shared";
import {
  allClientSourcesFilter,
  filterAdminClients,
  getAdminClientSourceOptions,
  sortAdminClientsByLastLogin,
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

  it("sorts filtered clients by the latest login without mutating the input", () => {
    const oldest = client({ id: "oldest", lastLoginAt: "2026-07-20T08:00:00.000Z" });
    const newest = client({ id: "newest", lastLoginAt: "2026-07-27T18:00:00.000Z" });
    const middle = client({ id: "middle", lastLoginAt: "2026-07-25T12:00:00.000Z" });
    const input = [oldest, newest, middle];

    expect(filterAdminClients(input, baseFilters).map((user) => user.id)).toEqual(["newest", "middle", "oldest"]);
    expect(input.map((user) => user.id)).toEqual(["oldest", "newest", "middle"]);
  });

  it("puts missing logins last and stabilizes equal timestamps by name and id", () => {
    const sameTime = "2026-07-27T12:00:00.000Z";
    const result = sortAdminClientsByLastLogin([
      client({ id: "z", displayName: "Борис", lastLoginAt: sameTime }),
      client({ id: "b", displayName: "Анна", lastLoginAt: sameTime }),
      client({ id: "a", displayName: "Анна", lastLoginAt: sameTime }),
      client({ id: "never", lastLoginAt: null })
    ]);

    expect(result.map((user) => user.id)).toEqual(["a", "b", "z", "never"]);
  });

  it.each([
    {
      label: "search",
      filters: { query: "совпадение" },
      matches: { firstName: "Совпадение старое" },
      newerMatches: { firstName: "Совпадение новое" },
      excluded: { firstName: "Другой клиент" }
    },
    {
      label: "subscription",
      filters: { subscription: "active" as const },
      matches: { membershipStatus: "active" as const },
      newerMatches: { membershipStatus: "active" as const },
      excluded: { membershipStatus: "inactive" as const }
    },
    {
      label: "tariff",
      filters: { tariff: "manual" },
      matches: { tariff: "manual" },
      newerMatches: { tariff: "manual" },
      excluded: { tariff: "lava" }
    },
    {
      label: "restrictions",
      filters: { restrictions: "restricted" as const },
      matches: { hasRestrictions: true },
      newerMatches: { hasRestrictions: true },
      excluded: { hasRestrictions: false }
    },
    {
      label: "source",
      filters: { source: "vk" },
      matches: { acquisition: { source: "vk", medium: "cpc", campaign: "one", content: null } },
      newerMatches: { acquisition: { source: "VK", medium: "social", campaign: "two", content: null } },
      excluded: { acquisition: { source: "email", medium: "newsletter", campaign: "three", content: null } }
    },
    {
      label: "UTM",
      filters: { utmField: "campaign" as const, utmValue: "лето" },
      matches: { acquisition: { source: "vk", medium: "cpc", campaign: "Лето один", content: null } },
      newerMatches: { acquisition: { source: "email", medium: "newsletter", campaign: "лето два", content: null } },
      excluded: { acquisition: { source: "direct", medium: "none", campaign: "зима", content: null } }
    }
  ])("sorts multiple matches after the $label filter", ({ filters, matches, newerMatches, excluded }) => {
    const result = filterAdminClients(
      [
        client({ id: "old-match", lastLoginAt: "2026-07-20T08:00:00.000Z", ...matches }),
        client({ id: "excluded-newest", lastLoginAt: "2026-07-29T08:00:00.000Z", ...excluded }),
        client({ id: "new-match", lastLoginAt: "2026-07-27T08:00:00.000Z", ...newerMatches })
      ],
      { ...baseFilters, ...filters }
    );

    expect(result.map((user) => user.id)).toEqual(["new-match", "old-match"]);
  });
});
