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

export function getProfileMembershipStatusText(input: { isMember: boolean; activeText: string; inactiveText: string }) {
  return input.isMember ? input.activeText : input.inactiveText;
}

export function getProfileMembershipStatusTone(input: { isMember: boolean }) {
  return input.isMember ? "profile-subscription-status-active" : "profile-subscription-status-inactive";
}

export function canUseReferralActivation(input: {
  isSaving: boolean;
  canActivate: boolean;
  availableDays: number;
  paymentType: string | null | undefined;
  recurrentPaymentStatus: string | null | undefined;
}) {
  if (input.isSaving || !input.canActivate || input.availableDays <= 0) {
    return false;
  }

  return !(input.paymentType === "recurrent" && input.recurrentPaymentStatus === "active");
}

export function getReferralRewardText(input: { rewardDays: number; prefix: string; daysUnit: string; suffix: string }) {
  return `${input.prefix} +${input.rewardDays} ${input.daysUnit} ${input.suffix}`;
}
