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
    expect(isPaymentAmountValid(990, 990, "RUB")).toBe(true);
    expect(isPaymentAmountValid(990, 991, "RUB")).toBe(false);
    expect(isPaymentAmountValid(990, 990, "EUR")).toBe(false);
  });
});
