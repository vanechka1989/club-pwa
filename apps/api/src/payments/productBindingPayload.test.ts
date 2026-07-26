import { describe, expect, it } from "vitest";
import { productBindingPayloadSchema } from "./productBindingPayload";

describe("product binding payload contract", () => {
  it("accepts price rows with isEnabled and does not translate them to enabled", () => {
    const payload = productBindingPayloadSchema.parse({
      provider: "lava",
      enabled: true,
      externalProductId: "product-1",
      externalOfferId: "offer-1",
      prices: [{ currency: "USD", amountMinor: 1999, isEnabled: true }]
    });

    expect(payload.prices).toEqual([{ currency: "USD", amountMinor: 1999, isEnabled: true }]);
  });
});
