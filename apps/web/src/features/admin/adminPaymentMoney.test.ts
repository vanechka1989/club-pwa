import { describe, expect, it } from "vitest";
import { formatAdminPaymentMoney } from "./adminPaymentMoney";

describe("admin payment money", () => {
  it.each([
    [{ currency: "RUB" as const, amountMinor: 99050, amountRub: 990 }, "₽"],
    [{ currency: "USD" as const, amountMinor: 1999, amountRub: null }, "$"],
    [{ currency: "EUR" as const, amountMinor: 1750, amountRub: null }, "€"]
  ])("preserves %s currency in payment logs", (order, symbol) => {
    expect(formatAdminPaymentMoney(order)).toContain(symbol);
  });
});
