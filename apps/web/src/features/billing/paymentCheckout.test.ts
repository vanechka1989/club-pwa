import type { PaymentProduct } from "@club/shared";
import { describe, expect, it } from "vitest";
import { productCheckoutAction, productCurrencyOptions, retryCheckoutForCurrency, serverCurrencyPickerAction } from "./paymentCheckout";

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

  it("opens a currency picker before checkout for multiple currencies, but confirms a single one directly", () => {
    expect(productCheckoutAction(product({
      prices: [{ currency: "USD", amountMinor: 1999 }, { currency: "EUR", amountMinor: 1750 }]
    }))).toEqual({
      kind: "choose_currency",
      currencyOptions: [{ currency: "USD", amountMinor: 1999 }, { currency: "EUR", amountMinor: 1750 }]
    });
    expect(productCheckoutAction(product({ prices: [{ currency: "USD", amountMinor: 1999 }] }))).toEqual({
      kind: "confirm",
      currency: "USD"
    });
  });

  it("keeps the chosen provider on currency retry and does not create a checkout request on cancel", () => {
    expect(retryCheckoutForCurrency("lava", "EUR")).toEqual({ provider: "lava", currency: "EUR" });
    expect(retryCheckoutForCurrency("lava")).toBeNull();
  });

  it("reopens the currency picker only for a server currencyOptions response", () => {
    expect(serverCurrencyPickerAction(product({ id: "product-1" }), "lava", {
      currencyOptions: [{ currency: "EUR", amountMinor: 1750 }]
    })).toEqual({
      kind: "choose_currency",
      productId: "product-1",
      provider: "lava",
      currencyOptions: [{ currency: "EUR", amountMinor: 1750 }]
    });
    expect(serverCurrencyPickerAction(product({ id: "product-1" }), "lava", {})).toBeNull();
  });
});
