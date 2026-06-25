type RecurrentSubscriptionStatus = {
  status: string;
};

type RecurrentMembershipState = {
  isActiveMembership: boolean;
  subscriptionProvider?: string | null;
};

export function hasActiveRecurrentSubscription(subscriptions: RecurrentSubscriptionStatus[]) {
  return subscriptions.some((subscription) => subscription.status === "active");
}

export function hasBlockingRecurrentSubscription(
  subscriptions: RecurrentSubscriptionStatus[],
  membership: RecurrentMembershipState
) {
  if (hasActiveRecurrentSubscription(subscriptions)) {
    return true;
  }

  return (
    membership.isActiveMembership &&
    membership.subscriptionProvider === "prodamus_recurrent" &&
    subscriptions.some((subscription) => subscription.status === "cancelled")
  );
}
