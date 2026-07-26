import { describe, expect, it } from "vitest";
import { applyLavaCatalogItem, lavaCatalogAccessDays } from "./paymentProductForm";

const form = {
  kind: "one_time" as const,
  title: "Черновик",
  amountRub: 990,
  accessDays: 14
};

describe("Lava tariff autofill", () => {
  it("copies the fixed catalog title, price, type and monthly period", () => {
    const result = applyLavaCatalogItem(form, {
      id: "catalog-1",
      externalProductId: "product-1",
      externalOfferId: "offer-1",
      title: "Клуб на месяц",
      kind: "recurrent",
      amountRub: 100,
      periodicity: "MONTHLY",
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-26T00:00:00.000Z"
    });

    expect(result).toEqual({
      kind: "recurrent",
      title: "Клуб на месяц",
      amountRub: 100,
      accessDays: 30
    });
  });

  it("keeps the entered price and access period when Lava does not provide them", () => {
    const result = applyLavaCatalogItem(form, {
      id: "catalog-2",
      externalProductId: "product-2",
      externalOfferId: "offer-2",
      title: "Свободная цена",
      kind: "one_time",
      amountRub: null,
      periodicity: null,
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-26T00:00:00.000Z"
    });

    expect(result.amountRub).toBe(990);
    expect(result.accessDays).toBe(14);
  });

  it("preserves a missing legacy RUB price instead of fabricating one", () => {
    const result = applyLavaCatalogItem({ ...form, amountRub: null }, {
      id: "catalog-3",
      externalProductId: "product-3",
      externalOfferId: "offer-3",
      title: "USD-only product",
      kind: "one_time",
      amountRub: null,
      periodicity: null,
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-27T00:00:00.000Z"
    });

    expect(result.amountRub).toBeNull();
  });

  it("clears the initial RUB price when the selected Lava offer is USD-only", () => {
    const result = applyLavaCatalogItem(form, {
      id: "catalog-usd",
      externalProductId: "product-usd",
      externalOfferId: "offer-usd",
      title: "USD-only product",
      kind: "one_time",
      amountRub: null,
      prices: [{ currency: "USD", amountMinor: 1999, periodicity: null }],
      periodicity: null,
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-27T00:00:00.000Z"
    });

    expect(result.amountRub).toBeNull();
  });

  it.each([
    ["MONTHLY", 30],
    ["PERIOD_90_DAYS", 90],
    ["PERIOD_180_DAYS", 180],
    ["PERIOD_YEAR", 365],
    [null, null]
  ])("maps Lava periodicity %s to %s access days", (periodicity, expected) => {
    expect(lavaCatalogAccessDays(periodicity)).toBe(expected);
  });
});
