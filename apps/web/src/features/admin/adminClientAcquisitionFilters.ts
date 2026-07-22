import type { AdminStatsUser } from "@club/shared";

export const allClientSourcesFilter = "__all_sources__";
export const untaggedClientSourceFilter = "__untagged_source__";

export type AdminClientUtmField = "all" | "source" | "medium" | "campaign" | "content";

export type AdminClientFilters = {
  query: string;
  subscription: "all" | "active" | "closed";
  tariff: string;
  restrictions: "all" | "restricted";
  source: string;
  utmField: AdminClientUtmField;
  utmValue: string;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("ru") ?? "";
}

export function getAdminClientSourceOptions(users: AdminStatsUser[]) {
  const sources = new Map<string, string>();
  for (const user of users) {
    const label = user.acquisition?.source?.trim();
    if (label) {
      sources.set(normalize(label), sources.get(normalize(label)) ?? label);
    }
  }

  return Array.from(sources.entries())
    .sort(([, left], [, right]) => left.localeCompare(right, "ru"))
    .map(([value, label]) => ({ value, label }));
}

export function filterAdminClients(users: AdminStatsUser[], filters: AdminClientFilters) {
  const query = normalize(filters.query);
  const source = normalize(filters.source);
  const utmValue = normalize(filters.utmValue);

  return users.filter((user) => {
    const matchesQuery =
      !query ||
      [user.telegramId, user.firstName, user.username, user.displayName, user.email].some((value) => normalize(value).includes(query));
    const matchesSubscription =
      filters.subscription === "all" ||
      (filters.subscription === "active" ? user.membershipStatus === "active" : user.membershipStatus !== "active");
    const matchesTariff = filters.tariff === "all" || (user.tariff || "future") === filters.tariff;
    const matchesRestrictions = filters.restrictions === "all" || user.hasRestrictions;
    const userSource = normalize(user.acquisition?.source);
    const matchesSource =
      filters.source === allClientSourcesFilter ||
      (filters.source === untaggedClientSourceFilter ? !userSource : userSource === source);

    const acquisition = user.acquisition;
    const utmValues = acquisition
      ? filters.utmField === "all"
        ? [acquisition.source, acquisition.medium, acquisition.campaign, acquisition.content]
        : [acquisition[filters.utmField]]
      : [];
    const matchesUtm = !utmValue || utmValues.some((value) => normalize(value).includes(utmValue));

    return matchesQuery && matchesSubscription && matchesTariff && matchesRestrictions && matchesSource && matchesUtm;
  });
}
