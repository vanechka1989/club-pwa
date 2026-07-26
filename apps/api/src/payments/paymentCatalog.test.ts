import { describe, expect, it } from "vitest";
import { mapLavaCatalogItem } from "./paymentCatalog";

describe("Lava catalog response mapping", () => {
  it("returns every stored currency price with the catalog item", () => {
    expect(mapLavaCatalogItem({
      id: "catalog-1",
      externalProductId: "product-1",
      externalOfferId: "offer-1",
      title: "USD-only product",
      kind: "one_time",
      amountRub: null,
      metadata: { periodicity: null },
      isStale: false,
      isSelectable: true,
      syncedAt: new Date("2026-07-27T00:00:00.000Z"),
      prices: [{ currency: "USD" as const, amountMinor: 1999, periodicity: null }]
    })).toMatchObject({
      id: "catalog-1",
      prices: [{ currency: "USD", amountMinor: 1999, periodicity: null }]
    });
  });
});
