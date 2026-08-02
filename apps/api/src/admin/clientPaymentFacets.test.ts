import { describe, expect, it } from "vitest";
import { buildClientPaymentFacetMaps } from "./clientPaymentFacets";

describe("buildClientPaymentFacetMaps", () => {
  it("keeps unique product and provider facets from paid orders only", () => {
    const facets = buildClientPaymentFacetMaps([
      { userId: "u1", status: "paid", productId: "p1", provider: "lava" },
      { userId: "u1", status: "paid", productId: "p1", provider: "lava" },
      { userId: "u1", status: "failed", productId: "p2", provider: "prodamus" },
      { userId: "u1", status: "pending", productId: "p3", provider: "prodamus" },
      { userId: "u2", status: "paid", productId: "p2", provider: "prodamus" },
      { userId: "u2", status: "paid", productId: null, provider: "lava" }
    ]);

    expect(facets.get("u1")).toEqual({ paymentProductIds: ["p1"], paymentProviders: ["lava"] });
    expect(facets.get("u2")).toEqual({ paymentProductIds: ["p2"], paymentProviders: ["lava", "prodamus"] });
    expect(facets.get("missing")).toBeUndefined();
  });
});
