import { describe, expect, it } from "vitest";
import { prepareProductBindingPrices } from "./productBindingPrices";

const lava = {
  provider: "lava" as const,
  enabled: true,
  externalProductId: "lava-product",
  externalOfferId: "lava-offer",
  prices: [{ currency: "USD" as const, amountMinor: 1999, isEnabled: true }]
};

const catalog = [{
  providerId: "lava-provider",
  externalOfferId: "lava-offer",
  isStale: false,
  isSelectable: true,
  prices: [{ currency: "USD" as const, amountMinor: 1999 }]
}];

describe("product binding price preparation", () => {
  it("keeps the selected Lava currency price for persistence", () => {
    expect(prepareProductBindingPrices({
      bindings: [lava],
      providers: [{ id: "lava-provider", provider: "lava" as const }],
      catalogItems: catalog,
      amountRub: null
    })).toEqual({
      ok: true,
      bindings: [{ ...lava, prices: lava.prices }]
    });
  });

  it("rejects duplicate, disabled-only, unsupported, and non-positive Lava prices", () => {
    const base = { providers: [{ id: "lava-provider", provider: "lava" as const }], catalogItems: catalog, amountRub: null };

    expect(prepareProductBindingPrices({ ...base, bindings: [{ ...lava, prices: [lava.prices[0]!, { ...lava.prices[0]! }] }] }).ok).toBe(false);
    expect(prepareProductBindingPrices({ ...base, bindings: [{ ...lava, prices: [{ ...lava.prices[0]!, isEnabled: false }] }] }).ok).toBe(false);
    expect(prepareProductBindingPrices({ ...base, bindings: [{ ...lava, prices: [{ currency: "GBP" as never, amountMinor: 1999, isEnabled: true }] }] }).ok).toBe(false);
    expect(prepareProductBindingPrices({ ...base, bindings: [{ ...lava, prices: [{ currency: "USD", amountMinor: 0, isEnabled: true }] }] }).ok).toBe(false);
  });

  it("rejects a stale, unavailable, or fixed-price-drifted selected Lava offer", () => {
    const base = { bindings: [lava], providers: [{ id: "lava-provider", provider: "lava" as const }], amountRub: null };

    expect(prepareProductBindingPrices({ ...base, catalogItems: [{ ...catalog[0]!, isStale: true }] }).ok).toBe(false);
    expect(prepareProductBindingPrices({ ...base, catalogItems: [{ ...catalog[0]!, isSelectable: false }] }).ok).toBe(false);
    expect(prepareProductBindingPrices({ ...base, catalogItems: [{ ...catalog[0]!, prices: [{ currency: "USD" as const, amountMinor: 2000 }] }] }).ok).toBe(false);
  });

  it("allows an existing binding to be edited when its catalog offer became stale", () => {
    expect(prepareProductBindingPrices({
      bindings: [lava],
      existingBindings: [{ provider: "lava" as const, externalOfferId: "lava-offer" }],
      providers: [{ id: "lava-provider", provider: "lava" as const }],
      catalogItems: [{ ...catalog[0]!, isStale: true, isSelectable: false }],
      amountRub: null
    }).ok).toBe(true);
  });

  it("uses the administrator amount for dynamic or legacy-unresolved Lava offers", () => {
    const dynamic = { ...catalog[0]!, prices: [{ currency: "USD" as const, amountMinor: null }] };
    const base = { bindings: [lava], providers: [{ id: "lava-provider", provider: "lava" as const }], amountRub: null };
    expect(prepareProductBindingPrices({ ...base, catalogItems: [dynamic] }).ok).toBe(true);
    expect(prepareProductBindingPrices({
      ...base,
      existingBindings: [{ provider: "lava" as const, externalOfferId: "lava-offer" }],
      catalogItems: []
    }).ok).toBe(true);
  });

  it("keeps Prodamus on its positive legacy RUB amount and rejects a foreign binding price", () => {
    const prodamus = { provider: "prodamus" as const, enabled: true, externalProductId: null, externalOfferId: null, prices: [] };
    expect(prepareProductBindingPrices({
      bindings: [prodamus],
      providers: [{ id: "prodamus-provider", provider: "prodamus" as const }],
      catalogItems: [],
      amountRub: 990
    })).toEqual({
      ok: true,
      bindings: [{ ...prodamus, prices: [{ currency: "RUB", amountMinor: 99000, isEnabled: true }] }]
    });
    expect(prepareProductBindingPrices({
      bindings: [{ ...prodamus, prices: [{ currency: "USD" as const, amountMinor: 1999, isEnabled: true }] }],
      providers: [{ id: "prodamus-provider", provider: "prodamus" as const }],
      catalogItems: [],
      amountRub: 990
    }).ok).toBe(false);
  });

  it("does not require a RUB amount for a disabled Prodamus fallback binding", () => {
    expect(prepareProductBindingPrices({
      bindings: [{ provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null, prices: [] }],
      providers: [{ id: "prodamus-provider", provider: "prodamus" as const }],
      catalogItems: [],
      amountRub: null
    })).toEqual({
      ok: true,
      bindings: [{ provider: "prodamus", enabled: false, externalProductId: null, externalOfferId: null, prices: [] }]
    });
  });
});
