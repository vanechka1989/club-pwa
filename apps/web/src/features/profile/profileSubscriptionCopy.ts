type ProfilePaymentActionInput = {
  hasManageableRecurrentSubscription: boolean;
  isMember: boolean;
  extendText: string;
  joinText: string;
};

export function getProfilePaymentActionText(input: ProfilePaymentActionInput) {
  if (input.hasManageableRecurrentSubscription) {
    return "Управление подпиской";
  }

  return input.isMember ? input.extendText : input.joinText;
}

export function getProfileSubscriptionHintText(_input: { hasManageableRecurrentSubscription: boolean }) {
  return null;
}
