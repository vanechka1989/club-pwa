import { describe, expect, it } from "vitest";
import { resolvePaymentOrderSnapshot } from "./paymentOrderSnapshot";

describe("payment order product snapshots", () => {
  it("uses the related shared product for a normal checkout", () => {
    expect(resolvePaymentOrderSnapshot({
      productId: "product-1",
      individualOfferId: null,
      productTitleSnapshot: null,
      productKindSnapshot: null,
      accessDaysSnapshot: null,
      product: { id: "product-1", title: "Общий тариф", kind: "one_time", accessDays: 30 }
    })).toEqual({ id: "product-1", title: "Общий тариф", kind: "one_time", accessDays: 30, source: "product" });
  });

  it("uses immutable fields for an individual offer order", () => {
    expect(resolvePaymentOrderSnapshot({
      productId: null,
      individualOfferId: "offer-1",
      productTitleSnapshot: "Персональная подписка",
      productKindSnapshot: "recurrent",
      accessDaysSnapshot: 45,
      product: null
    })).toEqual({ id: "offer-1", title: "Персональная подписка", kind: "recurrent", accessDays: 45, source: "offer" });
  });

  it("rejects an incomplete offer order instead of granting default access", () => {
    expect(() => resolvePaymentOrderSnapshot({
      productId: null,
      individualOfferId: "offer-1",
      productTitleSnapshot: null,
      productKindSnapshot: "one_time",
      accessDaysSnapshot: 30,
      product: null
    })).toThrow("PAYMENT_ORDER_PRODUCT_SNAPSHOT_MISSING");
  });
});
