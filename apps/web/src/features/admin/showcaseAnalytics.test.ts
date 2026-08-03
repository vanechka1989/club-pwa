import { describe, expect, it } from "vitest";
import { createShowcaseAnalytics } from "./showcaseAnalytics";

describe("showcase analytics", () => {
  const range = { from: "2026-07-05", to: "2026-08-03" };

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
});
