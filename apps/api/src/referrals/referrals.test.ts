import { describe, expect, it } from "vitest";
import {
  canActivateReferralRewards,
  normalizeReferralRewardDays,
  parseReferralStartParam
} from "./rules";

describe("referrals", () => {
  it("parses Telegram start referral params", () => {
    expect(parseReferralStartParam("ref_abC123_-")).toBe("abC123_-");
    expect(parseReferralStartParam("abc123")).toBeNull();
    expect(parseReferralStartParam("ref_")).toBeNull();
  });

  it("normalizes referral reward days", () => {
    expect(normalizeReferralRewardDays("14")).toBe(14);
    expect(normalizeReferralRewardDays("0")).toBe(7);
    expect(normalizeReferralRewardDays("bad")).toBe(7);
  });

  it("blocks activation for active recurrent payments only", () => {
    expect(
      canActivateReferralRewards({
        isActiveMembership: true,
        subscriptionProvider: "prodamus_recurrent",
        recurrentPaymentStatus: "active"
      })
    ).toEqual({ allowed: false, reason: "active_recurrent_payment" });

    expect(
      canActivateReferralRewards({
        isActiveMembership: true,
        subscriptionProvider: "prodamus",
        recurrentPaymentStatus: null
      })
    ).toEqual({ allowed: true, reason: null });
  });
});
