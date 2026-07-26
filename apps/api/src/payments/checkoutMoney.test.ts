import { describe, expect, it } from "vitest";
import { createCheckoutWithSnapshot, isLavaCatalogPriceCurrent, resolveCheckoutMoney } from "./checkoutMoney";

describe("checkout money resolution", () => {
  it("selects the requested enabled currency with its exact snapshot", () => {
    expect(resolveCheckoutMoney([
      { currency: "RUB", amountMinor: 99000, isEnabled: true },
      { currency: "USD", amountMinor: 1999, isEnabled: true },
      { currency: "EUR", amountMinor: 1750, isEnabled: false }
    ], "USD", "lava")).toEqual({ kind: "selected", currency: "USD", amountMinor: 1999 });
  });

  it("requires a currency choice when more than one price is enabled", () => {
    expect(resolveCheckoutMoney([
      { currency: "RUB", amountMinor: 99000, isEnabled: true },
      { currency: "USD", amountMinor: 1999, isEnabled: true }
    ], undefined, "lava")).toEqual({
      kind: "choice",
      options: [
        { currency: "RUB", amountMinor: 99000 },
        { currency: "USD", amountMinor: 1999 }
      ]
    });
  });

  it("keeps Prodamus RUB-only even when a foreign price is present", () => {
    expect(resolveCheckoutMoney([
      { currency: "RUB", amountMinor: 99000, isEnabled: true },
      { currency: "USD", amountMinor: 1999, isEnabled: true }
    ], "USD", "prodamus")).toEqual({ kind: "unavailable" });
  });

  it("rejects stale and missing fixed Lava catalog currencies before checkout", () => {
    expect(isLavaCatalogPriceCurrent(
      { isStale: false, prices: [{ currency: "RUB", amountMinor: 99000 }] },
      { currency: "USD", amountMinor: 1999 }
    )).toBe(false);
    expect(isLavaCatalogPriceCurrent(
      { isStale: true, prices: [{ currency: "USD", amountMinor: 1999 }] },
      { currency: "USD", amountMinor: 1999 }
    )).toBe(false);
    expect(isLavaCatalogPriceCurrent(
      { isStale: false, prices: [{ currency: "USD", amountMinor: 2000 }] },
      { currency: "USD", amountMinor: 1999 }
    )).toBe(false);
    expect(isLavaCatalogPriceCurrent(
      { isStale: false, prices: [{ currency: "USD", amountMinor: null }] },
      { currency: "USD", amountMinor: 1999 }
    )).toBe(true);
  });

  it("persists the selected snapshot and passes that exact pair to the adapter", async () => {
    const inserted: Array<{ currency: string; amountMinor: number; amountRub: number | null }> = [];
    const adapterProducts: Array<{ currency: string; amountMinor: number; amountRub: number | null }> = [];
    const result = await createCheckoutWithSnapshot({
      snapshot: { currency: "USD", amountMinor: 1999 },
      createOrder: async (snapshot) => {
        inserted.push(snapshot);
        return { providerOrderId: "club-order-1" };
      },
      createAdapterCheckout: async (order, snapshot) => {
        expect(order.providerOrderId).toBe("club-order-1");
        adapterProducts.push(snapshot);
        return { checkoutUrl: "https://pay.example/checkout", externalOrderId: "lava-order-1" };
      },
      persistExternalOrderId: async (order, externalOrderId) => {
        expect(order.providerOrderId).toBe("club-order-1");
        expect(externalOrderId).toBe("lava-order-1");
      }
    });

    expect(inserted).toEqual([{ currency: "USD", amountMinor: 1999, amountRub: null }]);
    expect(adapterProducts).toEqual([{ currency: "USD", amountMinor: 1999, amountRub: null }]);
    expect(result).toEqual({ checkoutUrl: "https://pay.example/checkout", externalOrderId: "lava-order-1" });
  });
});
