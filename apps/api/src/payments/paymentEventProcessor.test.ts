import { describe, expect, it } from "vitest";
import { getExtendedAccessExpiry, isPaymentAmountValid } from "./paymentEventRules";

describe("normalized payment event decisions", () => {
  it("extends a renewal from the current paid expiry", () => {
    expect(getExtendedAccessExpiry(
      new Date("2026-07-25T10:00:00.000Z"),
      new Date("2026-08-10T10:00:00.000Z"),
      30
    ).toISOString()).toBe("2026-09-09T10:00:00.000Z");
  });

  it("starts expired access from the payment time", () => {
    expect(getExtendedAccessExpiry(
      new Date("2026-07-25T10:00:00.000Z"),
      new Date("2026-07-01T10:00:00.000Z"),
      30
    ).toISOString()).toBe("2026-08-24T10:00:00.000Z");
  });

  it("requires the Lava webhook amount and currency to match the order", () => {
    const matches = isPaymentAmountValid as unknown as (
      expected: { currency: "RUB" | "USD" | "EUR"; amountMinor: number },
      actual: { currency: "RUB" | "USD" | "EUR"; amountMinor: number }
    ) => boolean;

    expect(matches({ currency: "USD", amountMinor: 1999 }, { currency: "USD", amountMinor: 1999 })).toBe(true);
    expect(matches({ currency: "USD", amountMinor: 1999 }, { currency: "USD", amountMinor: 2000 })).toBe(false);
    expect(matches({ currency: "USD", amountMinor: 1999 }, { currency: "EUR", amountMinor: 1999 })).toBe(false);
  });
});
