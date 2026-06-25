import { describe, expect, it } from "vitest";
import { hasActiveRecurrentSubscription } from "./recurrentCheckoutGuard";

describe("recurrent checkout guard", () => {
  it("blocks checkout when user has an active recurrent subscription", () => {
    expect(hasActiveRecurrentSubscription([{ status: "active" }])).toBe(true);
  });

  it("allows checkout when recurrent subscriptions are cancelled", () => {
    expect(hasActiveRecurrentSubscription([{ status: "cancelled" }])).toBe(false);
  });
});
