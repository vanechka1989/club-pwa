import type { PaymentProduct } from "@club/shared";
import { describe, expect, it } from "vitest";
import { productCurrencyOptions } from "./paymentCheckout";

function product(overrides: Partial<PaymentProduct>): PaymentProduct {
  return {
    id: "product", providerId: "provider", kind: "one_time", title: "Доступ", description: null, badgeLabel: null,
    amountRub: null, prices: [], accessDays: 30, prodamusSubscriptionId: null, bindings: [], isPublished: true,
    archivedUntil: null, createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z", ...overrides
  };
}

describe("product currency checkout options", () => {
  it("uses configured multicurrency prices instead of a legacy RUB amount", () => {
    expect(productCurrencyOptions(product({
      amountRub: 990,
      prices: [{ currency: "USD", amountMinor: 1999 }, { currency: "EUR", amountMinor: 1750 }]
    }))).toEqual([{ currency: "USD", amountMinor: 1999 }, { currency: "EUR", amountMinor: 1750 }]);
  });

  it("uses a RUB legacy fallback only when currency prices are absent", () => {
    expect(productCurrencyOptions(product({ amountRub: 990 }))).toEqual([{ currency: "RUB", amountMinor: 99000 }]);
  });
});
