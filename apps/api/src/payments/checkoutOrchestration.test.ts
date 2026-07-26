import { describe, expect, it, vi } from "vitest";
import { runCheckoutPreflight } from "./checkoutOrchestration";

describe("checkout preflight orchestration", () => {
  it("does not create an order for disabled or unavailable currencies", async () => {
    const createOrder = vi.fn();
    const result = await runCheckoutPreflight({
      provider: "lava", requestedCurrency: "USD", prices: [{ currency: "USD", amountMinor: 1999, isEnabled: false }], amountRub: null, catalogItem: null, createOrder
    });
    expect(result).toEqual({ kind: "unavailable" });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("does not create an order when a fixed Lava catalog price drifted", async () => {
    const createOrder = vi.fn();
    const result = await runCheckoutPreflight({
      provider: "lava", requestedCurrency: "USD", prices: [{ currency: "USD", amountMinor: 1999, isEnabled: true }], amountRub: null,
      catalogItem: { isStale: false, prices: [{ currency: "USD", amountMinor: 2000 }] }, createOrder
    });
    expect(result).toEqual({ kind: "drift" });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("creates fixed and dynamic Lava orders from the stored selected snapshot", async () => {
    const createOrder = vi.fn(async (money) => money);
    const fixed = await runCheckoutPreflight({
      provider: "lava", requestedCurrency: "USD", prices: [{ currency: "USD", amountMinor: 1999, isEnabled: true }], amountRub: null,
      catalogItem: { isStale: false, prices: [{ currency: "USD", amountMinor: 1999 }] }, createOrder
    });
    const dynamic = await runCheckoutPreflight({
      provider: "lava", requestedCurrency: "EUR", prices: [{ currency: "EUR", amountMinor: 1750, isEnabled: true }], amountRub: null,
      catalogItem: { isStale: false, prices: [{ currency: "EUR", amountMinor: null }] }, createOrder
    });
    expect(fixed).toEqual({ kind: "created", value: { currency: "USD", amountMinor: 1999 } });
    expect(dynamic).toEqual({ kind: "created", value: { currency: "EUR", amountMinor: 1750 } });
    expect(createOrder).toHaveBeenNthCalledWith(1, { currency: "USD", amountMinor: 1999 });
    expect(createOrder).toHaveBeenNthCalledWith(2, { currency: "EUR", amountMinor: 1750 });
  });

  it("uses a positive legacy RUB fallback only", async () => {
    const createOrder = vi.fn(async (money) => money);
    const zero = await runCheckoutPreflight({ provider: "lava", requestedCurrency: undefined, prices: [], amountRub: 0, catalogItem: null, createOrder });
    const legacy = await runCheckoutPreflight({ provider: "lava", requestedCurrency: undefined, prices: [], amountRub: 990, catalogItem: null, createOrder });
    expect(zero).toEqual({ kind: "unavailable" });
    expect(legacy).toEqual({ kind: "created", value: { currency: "RUB", amountMinor: 99000 } });
  });
});
