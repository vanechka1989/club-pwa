import { describe, expect, it } from "vitest";
import { getCompatibleLegacyRubAmount, getExtendedAccessExpiry, getPaidAccessExpiry, isPaymentAmountValid } from "./paymentEventRules";

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

  it("returns no expiry for lifetime access", () => {
    expect(getPaidAccessExpiry(
      new Date("2026-08-08T10:00:00.000Z"),
      new Date("2026-09-08T10:00:00.000Z"),
      "lifetime",
      null
    )).toBeNull();
  });

  it("rejects limited access without a duration", () => {
    expect(() => getPaidAccessExpiry(
      new Date("2026-08-08T10:00:00.000Z"),
      null,
      "limited",
      null
    )).toThrow("PAYMENT_ACCESS_DAYS_MISSING");
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

  it("copies a legacy amount into a renewal only when it matches the RUB snapshot", () => {
    expect(getCompatibleLegacyRubAmount({ currency: "RUB", amountMinor: 99000, amountRub: 990 })).toBe(990);
    expect(getCompatibleLegacyRubAmount({ currency: "USD", amountMinor: 1999, amountRub: 20 })).toBeNull();
    expect(getCompatibleLegacyRubAmount({ currency: "RUB", amountMinor: 99050, amountRub: 991 })).toBeNull();
    expect(getCompatibleLegacyRubAmount({ currency: "RUB", amountMinor: 99000, amountRub: 900 })).toBeNull();
  });
});
