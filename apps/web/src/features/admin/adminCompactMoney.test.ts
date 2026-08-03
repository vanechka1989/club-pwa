import { describe, expect, it } from "vitest";
import { formatAdminCompactMoney } from "./adminCompactMoney";

describe("formatAdminCompactMoney", () => {
  it.each([
    [164_950, "164 950 ₽"],
    [1_000_000, "1 млн ₽"],
    [1_250_000, "1,25 млн ₽"],
    [12_500_000, "12,5 млн ₽"],
    [125_000_000, "125 млн ₽"],
    [1_250_000_000, "1,25 млрд ₽"]
  ])("keeps the chart value on one readable line for %i rubles", (value, expected) => {
    expect(formatAdminCompactMoney(value)).toBe(expected);
  });
});
