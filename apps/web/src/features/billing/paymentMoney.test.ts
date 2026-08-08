import { describe, expect, it } from "vitest";
import { formatPaymentMoney } from "./paymentMoney";

describe("payment money formatter", () => {
  it.each([
    [{ currency: "RUB" as const, amountMinor: 50000 }, "500 ₽"],
    [{ currency: "RUB" as const, amountMinor: 50050 }, "500,50 ₽"],
    [{ currency: "USD" as const, amountMinor: 2000 }, "20 $"],
    [{ currency: "USD" as const, amountMinor: 1999 }, "19,99 $"],
    [{ currency: "EUR" as const, amountMinor: 1800 }, "18 €"],
    [{ currency: "EUR" as const, amountMinor: 1750 }, "17,50 €"]
  ])("omits zero cents and preserves real minor units for %s", (money, expected) => {
    const value = formatPaymentMoney(money).replace(/\s/g, " ");

    expect(value).toBe(expected);
  });
});
