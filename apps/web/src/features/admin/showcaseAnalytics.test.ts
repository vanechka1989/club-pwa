import { describe, expect, it } from "vitest";
import { createShowcaseAnalytics } from "./showcaseAnalytics";

describe("showcase analytics", () => {
  const range = { from: "2026-07-05", to: "2026-08-03" };
  const catalog = {
    products: [
      { id: "product-start", title: "Клуб", kind: "one_time" as const },
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
    expect(first.acquisition.sources.length).toBeGreaterThanOrEqual(4);
    expect(first.acquisition.sources.length).toBeLessThanOrEqual(8);
    expect(new Set(first.acquisition.sources.map((source) => source.label)).size).toBe(first.acquisition.sources.length);
    expect(first.acquisition.sources.reduce((sum, source) => sum + source.visits, 0)).toBe(first.acquisition.summary.visits);
    expect(first.acquisition.sources.reduce((sum, source) => sum + source.registrations, 0)).toBe(first.acquisition.summary.registrations);
    expect(first.acquisition.sources.reduce((sum, source) => sum + source.paidUsers, 0)).toBe(first.acquisition.summary.paidUsers);
    expect(first.acquisition.sources.reduce((sum, source) => sum + source.revenueRub, 0)).toBe(first.acquisition.summary.revenueRub);
    expect(first.acquisition.topLinks).toHaveLength(first.acquisition.sources.length);
    expect(first.acquisition.topLinks.map((link) => link.source)).toEqual(first.acquisition.sources.map((source) => source.key));
    expect(first.learning.summary.views).toBe(first.learning.cards.reduce((sum, card) => sum + card.views, 0));
    expect(first.stats.users.every((user) => user.email === null && user.phone === null)).toBe(true);
  });

  it("changes the presentation story when the seed changes", () => {
    const first = createShowcaseAnalytics(111, range);
    const second = createShowcaseAnalytics(222, range);
    expect(first).not.toEqual(second);
    expect(first.acquisition.sources).not.toEqual(second.acquisition.sources);
  });

  it("keeps every generated advertising channel internally plausible across repeated regeneration", () => {
    const snapshots = Array.from({ length: 100 }, (_, index) => createShowcaseAnalytics(index + 1, { from: "2026-08-03", to: "2026-08-03" }).acquisition);

    expect(new Set(snapshots.map((snapshot) => snapshot.sources.length)).size).toBeGreaterThan(1);
    for (const snapshot of snapshots) {
      expect(snapshot.sources.length).toBeGreaterThanOrEqual(4);
      expect(snapshot.sources.length).toBeLessThanOrEqual(8);
      for (const source of snapshot.sources) {
        expect(source.visits).toBeGreaterThanOrEqual(source.registrations);
        expect(source.registrations).toBeGreaterThanOrEqual(source.paidUsers);
        expect(source.revenueRub).toBeGreaterThanOrEqual(source.paidUsers);
        if (source.paidUsers === 0) expect(source.revenueRub).toBe(0);
        if (source.paidUsers > 0) expect(source.revenueRub).toBeGreaterThan(0);
      }
    }
  });

  it("distributes demo payments across the club's configured products and providers", () => {
    const snapshot = createShowcaseAnalytics(12345, range, catalog);

    expect(snapshot.finance.products.map((product) => ({ id: product.productId, title: product.title, kind: product.kind }))).toEqual(catalog.products);
    expect(snapshot.finance.providers.map((provider) => ({ code: provider.provider, title: provider.title }))).toEqual(catalog.providers);
    expect(new Set(snapshot.paymentOrders.map((order) => order.productTitle))).toEqual(new Set(catalog.products.map((product) => product.title)));
    expect(new Set(snapshot.paymentOrders.map((order) => order.provider))).toEqual(new Set(catalog.providers.map((provider) => provider.code)));
    expect(snapshot.finance.products.reduce((sum, product) => sum + product.revenueRub, 0)).toBe(snapshot.finance.overview.revenueRub);
    expect(snapshot.finance.providers.reduce((sum, provider) => sum + provider.revenueRub, 0)).toBe(snapshot.finance.overview.revenueRub);
    expect(snapshot.finance.products.map((product) => product.productId)).toEqual(catalog.products.map((product) => product.id));

    for (const breakdown of [snapshot.finance.retention.byProducts, snapshot.finance.retention.byProviders]) {
      expect(breakdown.reduce((sum, row) => sum + row.totalCustomers, 0)).toBe(snapshot.finance.retention.totalPayingCustomers);
      expect(breakdown.reduce((sum, row) => sum + row.activeCustomers, 0)).toBe(snapshot.finance.retention.activeCustomers);
      expect(breakdown.reduce((sum, row) => sum + row.churnedCustomers, 0)).toBe(snapshot.finance.retention.churnedCustomers);
      expect(breakdown.some((row) => row.churnedPercent > 0)).toBe(true);
    }
  });
});
