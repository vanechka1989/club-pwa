export const defaultReferralRewardDays = 7;

const referralCodePattern = /^[A-Za-z0-9_-]{4,32}$/;

export function parseReferralStartParam(startParam: string | null | undefined) {
  if (!startParam?.startsWith("ref_")) {
    return null;
  }

  const code = startParam.slice(4).trim();
  return referralCodePattern.test(code) ? code : null;
}

export function normalizeReferralRewardDays(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 3650 ? parsed : defaultReferralRewardDays;
}

export function canActivateReferralRewards({
  isActiveMembership,
  subscriptionProvider,
  recurrentPaymentStatus
}: {
  isActiveMembership: boolean;
  subscriptionProvider: string | null | undefined;
  recurrentPaymentStatus: "active" | "cancelled" | null | undefined;
}) {
  if (isActiveMembership && subscriptionProvider === "prodamus_recurrent" && recurrentPaymentStatus === "active") {
    return { allowed: false as const, reason: "active_recurrent_payment" as const };
  }

  return { allowed: true as const, reason: null };
}
