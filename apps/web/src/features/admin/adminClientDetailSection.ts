export const adminClientDetailSections = [
  "acquisition",
  "activity",
  "learning",
  "subscriptions",
  "payments",
  "referrals",
  "moderation",
  "devices",
  "login-ips"
] as const;

export type AdminClientDetailSection = (typeof adminClientDetailSections)[number];

export function isAdminClientDetailSection(value: string): value is AdminClientDetailSection {
  return (adminClientDetailSections as readonly string[]).includes(value);
}
