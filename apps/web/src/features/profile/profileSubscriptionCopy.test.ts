import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canUseReferralActivation,
  getProfileMembershipStatusText,
  getProfileMembershipStatusTone,
  getProfilePaymentActionText,
  getProfileSubscriptionHintText,
  getReferralRewardText
} from "./profileSubscriptionCopy";

describe("profile subscription copy", () => {
  it("uses only the button text for recurrent subscription management", () => {
    expect(
      getProfilePaymentActionText({
        hasManageableRecurrentSubscription: true,
        isMember: true,
        extendText: "Продлить",
        joinText: "Вступить в клуб"
      })
    ).toBe("Управление подпиской");

    expect(getProfileSubscriptionHintText({ hasManageableRecurrentSubscription: true })).toBeNull();
  });

  it("uses subscription wording and tone instead of premium wording", () => {
    expect(
      getProfileMembershipStatusText({
        isMember: true,
        activeText: "Подписка активна",
        inactiveText: "Подписка не активна"
      })
    ).toBe("Подписка активна");
    expect(getProfileMembershipStatusTone({ isMember: true })).toBe("profile-subscription-status-active");

    expect(
      getProfileMembershipStatusText({
        isMember: false,
        activeText: "Подписка активна",
        inactiveText: "Подписка не активна"
      })
    ).toBe("Подписка не активна");
    expect(getProfileMembershipStatusTone({ isMember: false })).toBe("profile-subscription-status-inactive");
  });

  it("blocks referral activation without days or with active recurrent payments", () => {
    expect(
      canUseReferralActivation({
        isSaving: false,
        canActivate: true,
        availableDays: 7,
        paymentType: "manual",
        recurrentPaymentStatus: null
      })
    ).toBe(true);

    expect(
      canUseReferralActivation({
        isSaving: false,
        canActivate: true,
        availableDays: 0,
        paymentType: "manual",
        recurrentPaymentStatus: null
      })
    ).toBe(false);

    expect(
      canUseReferralActivation({
        isSaving: false,
        canActivate: true,
        availableDays: 7,
        paymentType: "recurrent",
        recurrentPaymentStatus: "active"
      })
    ).toBe(false);
  });

  it("formats referral reward copy from project settings", () => {
    expect(
      getReferralRewardText({
        rewardDays: 7,
        prefix: "За каждого оплатившего реферала:",
        daysUnit: "дн.",
        suffix: "после первой оплаты."
      })
    ).toBe("За каждого оплатившего реферала: +7 дн. после первой оплаты.");
  });

  it("wires subscription status and referral reward copy into the profile screen", () => {
    const source = readFileSync(resolve(__dirname, "ProfileSection.vue"), "utf8");

    expect(source).toContain("profileSubscriptionStatusText");
    expect(source).toContain("profileSubscriptionStatusClass");
    expect(source).toContain("referralRewardText");
    expect(source).toContain(':disabled="!canActivateReferral"');
  });
});
