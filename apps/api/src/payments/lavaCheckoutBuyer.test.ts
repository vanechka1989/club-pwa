import { describe, expect, it } from "vitest";
import { resolveLavaCheckoutBuyerEmail } from "./lavaCheckoutBuyer";

describe("Lava checkout buyer email", () => {
  it("uses the configured test buyer email only for the owner", () => {
    expect(resolveLavaCheckoutBuyerEmail({
      isOwner: true,
      userEmail: "owner@example.com",
      testBuyerEmail: "buyer-test@example.com"
    })).toBe("buyer-test@example.com");

    expect(resolveLavaCheckoutBuyerEmail({
      isOwner: false,
      userEmail: "member@example.com",
      testBuyerEmail: "buyer-test@example.com"
    })).toBe("member@example.com");
  });

  it("falls back to the profile email when no test email is configured", () => {
    expect(resolveLavaCheckoutBuyerEmail({
      isOwner: true,
      userEmail: "owner@example.com",
      testBuyerEmail: null
    })).toBe("owner@example.com");
  });
});
