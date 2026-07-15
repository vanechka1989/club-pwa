import type { MembershipStatus } from "@club/shared";

type PaymentType = "none" | "manual" | "one_time" | "recurrent";
type RecurrentPaymentStatus = "active" | "cancelled" | null;

export function resolveMembershipPreview({
  actualStatus,
  actualExpiresAt,
  previewStatus,
  now = new Date()
}: {
  actualStatus: MembershipStatus;
  actualExpiresAt: Date | null;
  previewStatus: "active" | "inactive" | null;
  now?: Date;
}) {
  if (previewStatus === "inactive") {
    return { membershipStatus: "inactive" as const, membershipExpiresAt: null };
  }

  if (previewStatus === "active") {
    return {
      membershipStatus: "active" as const,
      membershipExpiresAt:
        actualStatus === "active" && actualExpiresAt
          ? actualExpiresAt
          : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    };
  }

  return { membershipStatus: actualStatus, membershipExpiresAt: actualExpiresAt };
}

function resolvePaymentType(provider: string | null | undefined): PaymentType {
  if (provider === "prodamus_recurrent") {
    return "recurrent";
  }

  if (provider === "prodamus") {
    return "one_time";
  }

  if (provider === "manual") {
    return "manual";
  }

  return "none";
}

export function resolveMembershipProfileFields({
  membershipStatus,
  subscriptionProvider,
  subscriptionExpiresAt,
  recurrentPaymentStatus
}: {
  membershipStatus: MembershipStatus;
  subscriptionProvider?: string | null;
  subscriptionExpiresAt?: Date | null;
  recurrentPaymentStatus?: RecurrentPaymentStatus;
}) {
  if (membershipStatus !== "active") {
    return {
      membershipExpiresAt: null,
      paymentType: "none" as const,
      recurrentPaymentStatus: null,
      nextPaymentAt: null
    };
  }

  const membershipExpiresAt = subscriptionExpiresAt?.toISOString() ?? null;
  const paymentType = resolvePaymentType(subscriptionProvider);
  const normalizedRecurrentPaymentStatus = paymentType === "recurrent" ? (recurrentPaymentStatus ?? null) : null;

  return {
    membershipExpiresAt,
    paymentType,
    recurrentPaymentStatus: normalizedRecurrentPaymentStatus,
    nextPaymentAt:
      paymentType === "recurrent" && normalizedRecurrentPaymentStatus === "active" ? membershipExpiresAt : null
  };
}
