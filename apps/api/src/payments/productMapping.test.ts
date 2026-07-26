import { describe, expect, it } from "vitest";
import { mapPaymentProduct } from "./productMapping";

const base = {
  id: "product-1", providerId: "lava-provider", kind: "one_time" as const, title: "Club", description: null,
  badgeLabel: null, amountRub: null, accessDays: 30, prodamusSubscriptionId: null, isPublished: true,
  archivedUntil: null, createdAt: new Date("2026-07-27T00:00:00Z"), updatedAt: new Date("2026-07-27T00:00:00Z")
};

describe("payment product mapping", () => {
  it("returns binding prices and flattens enabled prices for the active binding", () => {
    const product = mapPaymentProduct({
      ...base,
      providerBindings: [{
        provider: { provider: "lava" }, isEnabled: true, externalProductId: "lava-product", externalOfferId: "lava-offer",
        prices: [
          { currency: "USD" as const, amountMinor: 1999, isEnabled: true },
          { currency: "EUR" as const, amountMinor: 1750, isEnabled: false }
        ]
      }]
    });
    expect(product.bindings[0]?.prices).toEqual([
      { currency: "USD", amountMinor: 1999, enabled: true },
      { currency: "EUR", amountMinor: 1750, enabled: false }
    ]);
    expect(product.prices).toEqual([{ currency: "USD", amountMinor: 1999 }]);
  });

  it("exposes legacy Lava RUB only when the old product price is positive", () => {
    const legacy = mapPaymentProduct({
      ...base, amountRub: 990,
      providerBindings: [{ provider: { provider: "lava" }, isEnabled: true, externalProductId: "lava-product", externalOfferId: "legacy-offer", prices: [] }]
    });
    expect(legacy.prices).toEqual([{ currency: "RUB", amountMinor: 99000 }]);

    const foreignOnly = mapPaymentProduct({
      ...base,
      providerBindings: [{ provider: { provider: "lava" }, isEnabled: true, externalProductId: "lava-product", externalOfferId: "legacy-offer", prices: [] }]
    });
    expect(foreignOnly.prices).toEqual([]);

    for (const amountRub of [0, -1]) {
      expect(mapPaymentProduct({
        ...base, amountRub,
        providerBindings: [{ provider: { provider: "lava" }, isEnabled: true, externalProductId: "lava-product", externalOfferId: "legacy-offer", prices: [] }]
      }).prices).toEqual([]);
    }
  });
});
