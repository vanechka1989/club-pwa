import type { MembershipStatus } from "@club/shared";

type PaymentType = "none" | "manual" | "one_time" | "recurrent";
type RecurrentPaymentStatus = "active" | "cancelled" | null;

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
