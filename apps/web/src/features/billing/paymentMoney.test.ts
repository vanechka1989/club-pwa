import { describe, expect, it } from "vitest";
import { formatPaymentMoney } from "./paymentMoney";

describe("payment money formatter", () => {
  it.each([
    [{ currency: "RUB" as const, amountMinor: 123456 }, "₽"],
    [{ currency: "USD" as const, amountMinor: 1999 }, "$"],
    [{ currency: "EUR" as const, amountMinor: 1750 }, "€"]
  ])("formats %s from minor units without replacing its currency", (money, symbol) => {
    const value = formatPaymentMoney(money);

    expect(value).toContain(symbol);
    expect(value).toContain(money.currency === "RUB" ? "1\u00a0234,56" : money.currency === "USD" ? "19,99" : "17,50");
  });
});
