import type { MembershipStatus, TelegramBotStatus, UserRole } from "@club/shared";

export type MailingAccessStatus = "all" | "active" | "inactive";
export type MailingAccessType = "all" | "manual" | "one_time" | "recurrent" | "none";

export type MailingAudienceFilters = {
  accessStatus?: MailingAccessStatus;
  accessType?: MailingAccessType;
  excludeAdmins?: boolean;
  excludeRestricted?: boolean;
};

export type MailingAudienceUser = {
  id: string;
  telegramId: string;
  role: UserRole;
  membershipStatus: MembershipStatus;
  tariff: string | null;
  hasRestrictions: boolean;
  lastLoginAt: string;
  lastOpenedAt: string | null;
  telegramBotStatus: TelegramBotStatus;
  createdAt: string;
};

function normalizeAccessType(tariff: string | null): MailingAccessType {
  if (tariff === "manual") {
    return "manual";
  }

  if (tariff === "prodamus") {
    return "one_time";
  }

  if (tariff === "prodamus_recurrent") {
    return "recurrent";
  }

  return "none";
}

function matchesAccessStatus(user: MailingAudienceUser, status: MailingAccessStatus) {
  if (status === "all") {
    return true;
  }

  return status === "active" ? user.membershipStatus === "active" : user.membershipStatus !== "active";
}

function matchesAccessType(user: MailingAudienceUser, accessType: MailingAccessType) {
  return accessType === "all" || normalizeAccessType(user.tariff) === accessType;
}

export function filterMailingAudience(users: MailingAudienceUser[], filters: MailingAudienceFilters) {
  const accessStatus = filters.accessStatus ?? "active";
  const accessType = filters.accessType ?? "all";
  const excludeAdmins = filters.excludeAdmins ?? true;
  const excludeRestricted = filters.excludeRestricted ?? true;

  let excludedBotBlocked = 0;
  let excludedByFilters = 0;
  const recipients: MailingAudienceUser[] = [];
  const seenTelegramIds = new Set<string>();

  for (const user of users) {
    if (seenTelegramIds.has(user.telegramId)) {
      continue;
    }
    seenTelegramIds.add(user.telegramId);

    if (user.telegramBotStatus === "blocked") {
      excludedBotBlocked += 1;
      continue;
    }

    const allowed =
      matchesAccessStatus(user, accessStatus) &&
      matchesAccessType(user, accessType) &&
      (!excludeAdmins || user.role === "member") &&
      (!excludeRestricted || !user.hasRestrictions);

    if (!allowed) {
      excludedByFilters += 1;
      continue;
    }

    recipients.push(user);
  }

  return {
    recipients,
    excludedBotBlocked,
    excludedByFilters,
    totalBeforeFilters: users.length
  };
}
