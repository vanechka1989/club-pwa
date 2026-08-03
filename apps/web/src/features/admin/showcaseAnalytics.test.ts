import { describe, expect, it } from "vitest";
import { createShowcaseAnalytics } from "./showcaseAnalytics";

describe("showcase analytics", () => {
  const range = { from: "2026-07-05", to: "2026-08-03" };
  const catalog = {
    products: [
      { id: "product-start", title: "Старт", kind: "one_time" as const },
      { id: "product-club", title: "Клуб", kind: "recurrent" as const },
      { id: "product-vip", title: "VIP", kind: "recurrent" as const }
    ],
    providers: [
      { code: "prodamus" as const, title: "Prodamus" },
      { code: "lava" as const, title: "Lava" }
    ]
  };

  it("creates one deterministic and internally consistent presentation snapshot", () => {
    const first = createShowcaseAnalytics(12345, range);
    const second = createShowcaseAnalytics(12345, range);

    expect(second).toEqual(first);
    expect(first.stats.users).toHaveLength(first.stats.totalUsers);
    expect(first.stats.activeUsers).toBe(first.stats.users.filter((user) => user.membershipStatus === "active").length);
    expect(first.finance.overview.revenueRub).toBe(first.finance.providers.reduce((sum, row) => sum + row.revenueRub, 0));
    expect(first.finance.overview.revenueRub).toBe(first.paymentOrders.filter((order) => order.status === "paid").reduce((sum, order) => sum + (order.amountRub ?? 0), 0));
    expect(first.acquisition.summary.registrations).toBe(first.acquisition.timeline.reduce((sum, row) => sum + row.registrations, 0));
    expect(first.learning.summary.views).toBe(first.learning.cards.reduce((sum, card) => sum + card.views, 0));
    expect(first.stats.users.every((user) => user.email === null && user.phone === null)).toBe(true);
  });

  it("changes the presentation story when the seed changes", () => {
    expect(createShowcaseAnalytics(111, range)).not.toEqual(createShowcaseAnalytics(222, range));
  });

  it("distributes demo payments across the club's configured products and providers", () => {
    const snapshot = createShowcaseAnalytics(12345, range, catalog);

    expect(snapshot.finance.products.map((product) => ({ id: product.productId, title: product.title, kind: product.kind }))).toEqual(catalog.products);
    expect(snapshot.finance.providers.map((provider) => ({ code: provider.provider, title: provider.title }))).toEqual(catalog.providers);
    expect(new Set(snapshot.paymentOrders.map((order) => order.productTitle))).toEqual(new Set(catalog.products.map((product) => product.title)));
    expect(new Set(snapshot.paymentOrders.map((order) => order.provider))).toEqual(new Set(catalog.providers.map((provider) => provider.code)));
    expect(snapshot.finance.products.reduce((sum, product) => sum + product.revenueRub, 0)).toBe(snapshot.finance.overview.revenueRub);
    expect(snapshot.finance.providers.reduce((sum, provider) => sum + provider.revenueRub, 0)).toBe(snapshot.finance.overview.revenueRub);
  });
});
