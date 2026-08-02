import { describe, expect, it } from "vitest";
import { adminFinanceAnalyticsResponseSchema, adminStatsResponseSchema, adminStatsUserSchema } from "./index";

describe("admin finance analytics contracts", () => {
  it("keeps successful payment facets on admin clients", () => {
    const user = adminStatsUserSchema.parse({
      id: "user-1",
      telegramId: "100",
      firstName: "Иван",
      username: "ivan",
      photoUrl: null,
      role: "member",
      membershipStatus: "active",
      membershipExpiresAt: null,
      tariff: "lava_recurrent",
      hasRestrictions: false,
      completedItems: 0,
      totalItems: 1,
      lastOpenedItemTitle: null,
      lastOpenedAt: null,
      lastLoginAt: null,
      telegramBotStatus: "active",
      telegramBotBlockedAt: null,
      telegramBotUnblockedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      paymentProductIds: ["product-pro"],
      paymentProviders: ["lava"]
    });

    expect(user.paymentProductIds).toEqual(["product-pro"]);
    expect(user.paymentProviders).toEqual(["lava"]);
  });

  it("defaults new client facets and catalog options for older payloads", () => {
    const user = adminStatsUserSchema.parse({
      id: "user-1", telegramId: "100", firstName: null, username: null, photoUrl: null, role: "member",
      membershipStatus: "inactive", membershipExpiresAt: null, tariff: null, hasRestrictions: false,
      completedItems: 0, totalItems: 0, lastOpenedItemTitle: null, lastOpenedAt: null, lastLoginAt: null,
      telegramBotStatus: "unknown", telegramBotBlockedAt: null, telegramBotUnblockedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    const stats = adminStatsResponseSchema.parse({
      totalUsers: 1, activeUsers: 0, completedItems: 0, totalItems: 0, users: [user]
    });

    expect(user.paymentProductIds).toEqual([]);
    expect(user.paymentProviders).toEqual([]);
    expect(stats.paymentProductOptions).toEqual([]);
    expect(stats.paymentProviderOptions).toEqual([]);
  });

  it("parses provider, product and lifetime retention analytics", () => {
    const result = adminFinanceAnalyticsResponseSchema.parse({
      overview: {
        revenueRub: 42_000, paidOrders: 12, totalAttempts: 15, uniqueCustomers: 8,
        averagePaidOrderRub: 3_500, successPercent: 80
      },
      providers: [{
        provider: "lava", title: "Lava", attempts: 10, paidOrders: 8, uniqueCustomers: 6,
        revenueRub: 30_000, averagePaidOrderRub: 3_750, revenuePercent: 71, successPercent: 80
      }],
      products: [{
        productId: "product-pro", title: "Клуб Pro", kind: "recurrent", paidOrders: 8,
        uniqueCustomers: 6, revenueRub: 30_000, averagePaidOrderRub: 3_750, revenuePercent: 71
      }],
      retention: {
        totalPayingCustomers: 276,
        activeCustomers: 179,
        activePercent: 65,
        churnedCustomers: 97,
        churnedPercent: 35,
        onePurchaseChurned: 76,
        onePurchaseChurnedPercent: 78,
        repeatPurchaseChurned: 21,
        repeatPurchaseChurnedPercent: 22,
        exitStages: [{ renewals: 1, label: "После 1 продления", customers: 17, percentOfRepeatChurned: 81 }],
        byProviders: [{ key: "lava", title: "Lava", totalCustomers: 100, activeCustomers: 70, churnedCustomers: 30, churnedPercent: 30 }],
        byProducts: [{ key: "product-pro", title: "Клуб Pro", totalCustomers: 100, activeCustomers: 70, churnedCustomers: 30, churnedPercent: 30 }]
      }
    });

    expect(result.retention.churnedCustomers).toBe(97);
    expect(result.retention.exitStages[0]?.customers).toBe(17);
  });
});
