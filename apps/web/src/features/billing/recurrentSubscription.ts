import type { UserRecurrentSubscription } from "@club/shared";

export function findActiveRecurrentSubscription(subscriptions: UserRecurrentSubscription[]) {
  return subscriptions.find((subscription) => subscription.status === "active") ?? null;
}

export function shouldBlockNewPayments(subscriptions: UserRecurrentSubscription[]) {
  return Boolean(findActiveRecurrentSubscription(subscriptions));
}
