import type { AdminStatsUser } from "@club/shared";

export type AdminAccessBreakdownKey = "inactive" | "restricted" | "expiring_soon";

export type AdminAccessBreakdownItem = {
  key: AdminAccessBreakdownKey;
  label: string;
  value: number;
};

type UserDrilldownOptions = {
  now?: Date;
};

function isExpiringSoon(user: AdminStatsUser, now: Date) {
  if (user.membershipStatus !== "active" || !user.membershipExpiresAt) {
    return false;
  }

  const expiresAt = new Date(user.membershipExpiresAt);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return expiresAt >= now && expiresAt <= sevenDaysFromNow;
}

export function filterUsersByAccessBreakdown(
  key: AdminAccessBreakdownKey,
  users: AdminStatsUser[],
  options: UserDrilldownOptions = {}
) {
  const now = options.now ?? new Date();

  switch (key) {
    case "inactive":
      return users.filter((user) => user.membershipStatus !== "active");
    case "restricted":
      return users.filter((user) => user.hasRestrictions);
    case "expiring_soon":
      return users.filter((user) => isExpiringSoon(user, now));
  }
}

export function filterUsersByTariff(tariff: string, users: AdminStatsUser[]) {
  return users.filter((user) => (user.tariff || "future") === tariff);
}
