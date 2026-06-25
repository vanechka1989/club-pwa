import { describe, expect, it } from "vitest";
import { getProfilePaymentActionText, getProfileSubscriptionHintText } from "./profileSubscriptionCopy";

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
});
