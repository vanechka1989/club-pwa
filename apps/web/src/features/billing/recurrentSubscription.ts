import type { UserRecurrentSubscription } from "@club/shared";

type RecurrentAccessState = {
  paymentType?: "none" | "manual" | "one_time" | "recurrent" | null;
  recurrentPaymentStatus?: "active" | "cancelled" | null;
  membershipExpiresAt?: string | null;
  now?: Date;
};

export function findActiveRecurrentSubscription(subscriptions: UserRecurrentSubscription[]) {
  return subscriptions.find((subscription) => subscription.status === "active") ?? null;
}

export function findRestorableRecurrentSubscription(subscriptions: UserRecurrentSubscription[], state: RecurrentAccessState) {
  if (state.paymentType !== "recurrent" || state.recurrentPaymentStatus !== "cancelled" || !state.membershipExpiresAt) {
    return null;
  }

  const expiresAt = new Date(state.membershipExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= (state.now ?? new Date()).getTime()) {
    return null;
  }

  return [...subscriptions].reverse().find((subscription) => subscription.status === "cancelled") ?? null;
}

export function shouldBlockNewPayments(subscriptions: UserRecurrentSubscription[]) {
  return Boolean(findActiveRecurrentSubscription(subscriptions));
}
