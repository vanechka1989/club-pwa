import { describe, expect, it } from "vitest";
import {
  applyLavaCatalogItem,
  lavaCatalogAccessDays,
  lavaCatalogPeriodLabel,
  lavaCatalogPeriodOptions,
  lavaCatalogPricesForTariff,
  lavaPeriodicityForTariff,
  normalizePaymentAccess,
  paymentAccessLabel
} from "./paymentProductForm";

const form = {
  kind: "one_time" as const,
  title: "Черновик",
  amountRub: 990,
  accessType: "limited" as const,
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
      accessType: "limited",
      accessDays: 30
    });
  });

  it("turns lifetime access back into a dated period for recurrent payments", () => {
    expect(normalizePaymentAccess("recurrent", "lifetime", null)).toEqual({
      accessType: "limited",
      accessDays: 30
    });
  });

  it("keeps a one-time lifetime tariff without fake access days", () => {
    expect(normalizePaymentAccess("one_time", "lifetime", 30)).toEqual({
      accessType: "lifetime",
      accessDays: null
    });
  });

  it("formats permanent and dated access without nullable-day leakage", () => {
    expect(paymentAccessLabel("lifetime", null)).toBe("Постоянный доступ");
    expect(paymentAccessLabel("limited", 30)).toBe("30 дней");
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

  it("adds all fixed catalog currencies to a newly selected Lava binding", () => {
    const result = applyLavaCatalogItem({
      ...form,
      bindings: [{ provider: "lava" as const, enabled: true, externalProductId: null, externalOfferId: null, prices: [] }]
    }, {
      id: "catalog-multi", externalProductId: "product", externalOfferId: "offer", title: "Мультивалютный", kind: "one_time", amountRub: 990,
      prices: [{ currency: "RUB", amountMinor: 99000, periodicity: null }, { currency: "USD", amountMinor: 1999, periodicity: null }],
      periodicity: null, isStale: false, isSelectable: true, syncedAt: "2026-07-27T00:00:00.000Z"
    });

    expect(result.bindings?.[0]?.prices).toEqual([
      { currency: "RUB", amountMinor: 99000, isEnabled: true },
      { currency: "USD", amountMinor: 1999, isEnabled: true }
    ]);
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

  it.each([
    ["one_time", 30, "ONE_TIME"],
    ["recurrent", 30, "MONTHLY"],
    ["recurrent", 90, "PERIOD_90_DAYS"],
    ["recurrent", 180, "PERIOD_180_DAYS"],
    ["recurrent", 365, "PERIOD_YEAR"],
    ["recurrent", 45, null]
  ] as const)("maps tariff %s/%s to Lava period %s", (kind, accessDays, expected) => {
    expect(lavaPeriodicityForTariff(kind, accessDays)).toBe(expected);
  });

  it("selects only prices for the tariff billing period", () => {
    const item = {
      id: "catalog-periods",
      externalProductId: "product-periods",
      externalOfferId: "offer-periods",
      title: "Клуб",
      kind: "recurrent" as const,
      amountRub: 1500,
      periodicity: "MONTHLY",
      prices: [
        { currency: "RUB" as const, amountMinor: 150000, periodicity: "MONTHLY" },
        { currency: "USD" as const, amountMinor: 2000, periodicity: "MONTHLY" },
        { currency: "RUB" as const, amountMinor: 900000, periodicity: "PERIOD_180_DAYS" },
        { currency: "USD" as const, amountMinor: 12000, periodicity: "PERIOD_180_DAYS" }
      ],
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-27T00:00:00.000Z"
    };

    expect(lavaCatalogPricesForTariff(item, "recurrent", 180)).toEqual([
      { currency: "RUB", amountMinor: 900000, periodicity: "PERIOD_180_DAYS" },
      { currency: "USD", amountMinor: 12000, periodicity: "PERIOD_180_DAYS" }
    ]);
    expect(lavaCatalogPricesForTariff(item, "recurrent", 90)).toEqual([]);
  });

  it("discovers supported subscription periods in a stable order", () => {
    const item = {
      id: "catalog-period-options",
      externalProductId: "product-period-options",
      externalOfferId: "offer-period-options",
      title: "Клуб",
      kind: "recurrent" as const,
      amountRub: 100,
      periodicity: "MONTHLY",
      prices: [
        { currency: "USD" as const, amountMinor: 1500, periodicity: "PERIOD_YEAR" },
        { currency: "RUB" as const, amountMinor: 10000, periodicity: "MONTHLY" },
        { currency: "USD" as const, amountMinor: 500, periodicity: "MONTHLY" },
        { currency: "EUR" as const, amountMinor: 900, periodicity: "PERIOD_180_DAYS" },
        { currency: "RUB" as const, amountMinor: 30000, periodicity: "PERIOD_90_DAYS" },
        { currency: "RUB" as const, amountMinor: 1, periodicity: "WEEKLY" }
      ],
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-27T00:00:00.000Z"
    };

    expect(lavaCatalogPeriodOptions(item)).toEqual([
      { periodicity: "MONTHLY", accessDays: 30, label: "1 месяц" },
      { periodicity: "PERIOD_90_DAYS", accessDays: 90, label: "3 месяца" },
      { periodicity: "PERIOD_180_DAYS", accessDays: 180, label: "6 месяцев" },
      { periodicity: "PERIOD_YEAR", accessDays: 365, label: "1 год" }
    ]);
    expect(lavaCatalogPeriodLabel("ONE_TIME")).toBe("Разовая оплата");
  });

  it("keeps an available selected period when applying a multi-period offer", () => {
    const result = applyLavaCatalogItem({ ...form, accessDays: 180 }, {
      id: "catalog-current-period",
      externalProductId: "product-current-period",
      externalOfferId: "offer-current-period",
      title: "Клуб",
      kind: "recurrent",
      amountRub: 100,
      periodicity: "MONTHLY",
      prices: [
        { currency: "RUB", amountMinor: 10000, periodicity: "MONTHLY" },
        { currency: "RUB", amountMinor: 60000, periodicity: "PERIOD_180_DAYS" }
      ],
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-27T00:00:00.000Z"
    });

    expect(result.accessDays).toBe(180);
  });

  it("autofills only the selected catalog period prices", () => {
    const result = applyLavaCatalogItem({
      ...form,
      bindings: [{ provider: "lava" as const, enabled: true, externalProductId: null, externalOfferId: null, prices: [] }]
    }, {
      id: "catalog-periods",
      externalProductId: "product-periods",
      externalOfferId: "offer-periods",
      title: "Клуб",
      kind: "recurrent",
      amountRub: 1500,
      periodicity: "MONTHLY",
      prices: [
        { currency: "RUB", amountMinor: 150000, periodicity: "MONTHLY" },
        { currency: "USD", amountMinor: 2000, periodicity: "MONTHLY" },
        { currency: "RUB", amountMinor: 900000, periodicity: "PERIOD_180_DAYS" }
      ],
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-27T00:00:00.000Z"
    });

    expect(result.accessDays).toBe(30);
    expect(result.bindings?.[0]?.prices).toEqual([
      { currency: "RUB", amountMinor: 150000, isEnabled: true },
      { currency: "USD", amountMinor: 2000, isEnabled: true }
    ]);
  });
});
