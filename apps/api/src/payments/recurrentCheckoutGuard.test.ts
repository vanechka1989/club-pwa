import { describe, expect, it } from "vitest";
import { hasActiveRecurrentSubscription, hasBlockingRecurrentSubscription } from "./recurrentCheckoutGuard";

describe("recurrent checkout guard", () => {
  it("blocks checkout when user has an active recurrent subscription", () => {
    expect(hasActiveRecurrentSubscription([{ status: "active" }])).toBe(true);
  });

  it("allows checkout when recurrent subscriptions are cancelled", () => {
    expect(hasActiveRecurrentSubscription([{ status: "cancelled" }])).toBe(false);
  });

  it("blocks checkout when a cancelled recurrent subscription can still be restored", () => {
    expect(
      hasBlockingRecurrentSubscription([{ status: "cancelled" }], {
        isActiveMembership: true,
        subscriptionProvider: "prodamus_recurrent"
      })
    ).toBe(true);

    expect(
      hasBlockingRecurrentSubscription([{ status: "cancelled" }], {
        isActiveMembership: false,
        subscriptionProvider: "prodamus_recurrent"
      })
    ).toBe(false);
  });
});
