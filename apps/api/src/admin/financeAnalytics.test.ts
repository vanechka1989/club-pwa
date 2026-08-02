import { describe, expect, it } from "vitest";
import { buildAdminFinanceAnalytics, parseAdminFinanceRange, type AdminFinanceOrder, type AdminFinanceMembership } from "./financeAnalytics";

function paid(
  id: string,
  userId: string,
  provider: "lava" | "prodamus",
  productId: string,
  productTitle: string,
  amountRub: number,
  day: number
): AdminFinanceOrder {
  return {
    id, userId, provider, productId, productTitle, productKind: "recurrent", status: "paid",
    currency: "RUB", amountMinor: amountRub * 100, amountRub,
    paidAt: new Date(`2026-08-${String(day).padStart(2, "0")}T10:00:00.000Z`),
    createdAt: new Date(`2026-08-${String(day).padStart(2, "0")}T09:00:00.000Z`)
  };
}

describe("buildAdminFinanceAnalytics", () => {
  it("aggregates period revenue and lifetime retention without duplicating clients", () => {
    const orders: AdminFinanceOrder[] = [
      paid("1", "u1", "lava", "pA", "Базовый", 100, 1),
      paid("2", "u1", "lava", "pA", "Базовый", 100, 2),
      paid("3", "u2", "lava", "pA", "Базовый", 100, 3),
      paid("4", "u3", "prodamus", "pB", "Премиум", 200, 4),
      paid("5", "u3", "prodamus", "pB", "Премиум", 200, 5),
      paid("6", "u4", "prodamus", "pB", "Премиум", 200, 6),
      paid("7", "u4", "prodamus", "pB", "Премиум", 200, 7),
      paid("8", "u4", "prodamus", "pB", "Премиум", 200, 8),
      paid("9", "u5", "lava", "pA", "Базовый", 100, 9),
      paid("10", "u5", "lava", "pA", "Базовый", 100, 10),
      paid("11", "u5", "lava", "pA", "Базовый", 100, 11),
      paid("12", "u5", "lava", "pA", "Базовый", 100, 12),
      paid("13", "u5", "lava", "pA", "Базовый", 100, 13),
      paid("14", "u6", "prodamus", "pB", "Премиум", 200, 14),
      {
        ...paid("15", "u2", "lava", "pA", "Базовый", 100, 15),
        status: "failed", paidAt: null
      }
    ];
    const memberships: AdminFinanceMembership[] = [
      { userId: "u1", status: "active", expiresAt: new Date("2026-09-01T00:00:00.000Z") },
      { userId: "u6", status: "active", expiresAt: null },
      { userId: "u2", status: "inactive", expiresAt: new Date("2026-07-01T00:00:00.000Z") }
    ];

    const result = buildAdminFinanceAnalytics({
      orders,
      memberships,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
      now: new Date("2026-08-20T00:00:00.000Z")
    });

    expect(result.overview).toEqual({
      revenueRub: 2_000, paidOrders: 14, totalAttempts: 15, uniqueCustomers: 6,
      averagePaidOrderRub: 143, successPercent: 93.3
    });
    expect(result.providers).toEqual([
      { provider: "prodamus", title: "Prodamus", attempts: 6, paidOrders: 6, uniqueCustomers: 3, revenueRub: 1_200, averagePaidOrderRub: 200, revenuePercent: 60, successPercent: 100 },
      { provider: "lava", title: "Lava", attempts: 9, paidOrders: 8, uniqueCustomers: 3, revenueRub: 800, averagePaidOrderRub: 100, revenuePercent: 40, successPercent: 88.9 }
    ]);
    expect(result.products.map((row) => [row.productId, row.revenueRub, row.uniqueCustomers])).toEqual([
      ["pB", 1_200, 3],
      ["pA", 800, 3]
    ]);
    expect(result.retention).toMatchObject({
      totalPayingCustomers: 6,
      activeCustomers: 2,
      activePercent: 33.3,
      churnedCustomers: 4,
      churnedPercent: 66.7,
      onePurchaseChurned: 1,
      onePurchaseChurnedPercent: 25,
      repeatPurchaseChurned: 3,
      repeatPurchaseChurnedPercent: 75
    });
    expect(result.retention.exitStages).toEqual([
      { renewals: 1, label: "После 1 продления", customers: 1, percentOfRepeatChurned: 33.3 },
      { renewals: 2, label: "После 2 продлений", customers: 1, percentOfRepeatChurned: 33.3 },
      { renewals: 4, label: "После 4+ продлений", customers: 1, percentOfRepeatChurned: 33.3 }
    ]);
    expect(result.retention.byProviders).toEqual([
      { key: "lava", title: "Lava", totalCustomers: 3, activeCustomers: 1, churnedCustomers: 2, churnedPercent: 66.7 },
      { key: "prodamus", title: "Prodamus", totalCustomers: 3, activeCustomers: 1, churnedCustomers: 2, churnedPercent: 66.7 }
    ]);
  });

  it("returns stable zero values when there are no payments", () => {
    const result = buildAdminFinanceAnalytics({ orders: [], memberships: [], now: new Date("2026-08-20T00:00:00.000Z") });

    expect(result.overview).toEqual({ revenueRub: 0, paidOrders: 0, totalAttempts: 0, uniqueCustomers: 0, averagePaidOrderRub: 0, successPercent: 0 });
    expect(result.providers).toEqual([]);
    expect(result.products).toEqual([]);
    expect(result.retention.totalPayingCustomers).toBe(0);
    expect(result.retention.exitStages).toEqual([]);
  });
});

describe("parseAdminFinanceRange", () => {
  it("accepts an omitted range or a complete inclusive date range", () => {
    expect(parseAdminFinanceRange(undefined, undefined)).toEqual({});
    expect(parseAdminFinanceRange("2026-08-01", "2026-08-03")).toEqual({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-03T23:59:59.999Z")
    });
  });

  it("rejects partial, invalid and reversed ranges", () => {
    expect(() => parseAdminFinanceRange("2026-08-01", undefined)).toThrow("Invalid finance analytics date range");
    expect(() => parseAdminFinanceRange("bad", "2026-08-03")).toThrow("Invalid finance analytics date range");
    expect(() => parseAdminFinanceRange("2026-08-04", "2026-08-03")).toThrow("Invalid finance analytics date range");
  });
});
