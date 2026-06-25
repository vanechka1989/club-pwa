type RecurrentSubscriptionStatus = {
  status: string;
};

export function hasActiveRecurrentSubscription(subscriptions: RecurrentSubscriptionStatus[]) {
  return subscriptions.some((subscription) => subscription.status === "active");
}
