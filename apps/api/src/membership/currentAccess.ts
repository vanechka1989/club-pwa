import type { CurrentAccess, MembershipStatus, PaymentAccessType, PaymentProductKind } from "@club/shared";

type AccessProduct = {
  title: string;
  kind: PaymentProductKind;
  accessType: PaymentAccessType;
  accessDays: number | null;
};

export type CurrentAccessInput = {
  membershipStatus: MembershipStatus;
  provider: string | null;
  expiresAt: Date | null;
  nextPaymentAt: Date | null;
  product: AccessProduct | null;
  bonusDays: number | null;
};

export function resolveCurrentAccess(input: CurrentAccessInput): CurrentAccess | null {
  if (input.membershipStatus !== "active") {
    return null;
  }

  const common = {
    accessDays: input.product?.accessDays ?? null,
    bonusDays: input.provider === "referral_bonus" ? input.bonusDays : null,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    nextPaymentAt: input.nextPaymentAt?.toISOString() ?? null
  };

  if (input.provider === "manual") {
    return { source: "gift", title: "Подарочная подписка", ...common, accessDays: null };
  }

  if (input.provider === "referral_bonus") {
    return { source: "referral", title: "Реферальный бонус", ...common, accessDays: null };
  }

  if (input.product && (input.provider === "prodamus_recurrent" || input.provider === "lava_recurrent")) {
    return { source: "recurrent", title: input.product.title, ...common };
  }

  if (input.product && (input.provider === "prodamus" || input.provider === "lava")) {
    if (input.product.accessType === "lifetime") {
      return { source: "lifetime", title: input.product.title, ...common, nextPaymentAt: null };
    }
    return { source: "one_time", title: input.product.title, ...common, nextPaymentAt: null };
  }

  return { source: "unknown", title: "Доступ к клубу", ...common, accessDays: null, bonusDays: null };
}
