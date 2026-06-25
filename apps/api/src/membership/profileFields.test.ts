import { describe, expect, it } from "vitest";
import { resolveMembershipProfileFields } from "./profileFields";

describe("membership profile fields", () => {
  it("hides active payment metadata when membership is no longer active", () => {
    expect(
      resolveMembershipProfileFields({
        membershipStatus: "inactive",
        subscriptionProvider: "prodamus_recurrent",
        subscriptionExpiresAt: new Date("2026-07-25T14:00:00.000Z"),
        recurrentPaymentStatus: "active"
      })
    ).toEqual({
      membershipExpiresAt: null,
      paymentType: "none",
      recurrentPaymentStatus: null,
      nextPaymentAt: null
    });
  });

  it("keeps recurrent payment metadata for active membership", () => {
    expect(
      resolveMembershipProfileFields({
        membershipStatus: "active",
        subscriptionProvider: "prodamus_recurrent",
        subscriptionExpiresAt: new Date("2026-07-25T14:00:00.000Z"),
        recurrentPaymentStatus: "active"
      })
    ).toEqual({
      membershipExpiresAt: "2026-07-25T14:00:00.000Z",
      paymentType: "recurrent",
      recurrentPaymentStatus: "active",
      nextPaymentAt: "2026-07-25T14:00:00.000Z"
    });
  });
});
