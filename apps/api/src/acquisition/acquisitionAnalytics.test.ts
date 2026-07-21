import { describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://club:club@localhost:5432/club";
});
import { buildAcquisitionDashboard, buildAcquisitionDayDetail, buildUserAcquisition } from "./acquisitionAnalytics";

const linkA = { id: "a", aid: "telegram-july", name: "Telegram", source: "telegram", medium: "post", campaign: "july", content: null, destination: { kind: "home" as const }, isActive: true, createdAt: new Date("2026-07-01"), updatedAt: new Date("2026-07-01") };
const linkB = { id: "b", aid: "vk-july", name: "VK", source: "vk", medium: "ads", campaign: "july", content: "blue", destination: { kind: "billing" as const }, isActive: true, createdAt: new Date("2026-07-01"), updatedAt: new Date("2026-07-01") };
const visits = [
  { id: "v1", visitorHash: "visitor-1", linkId: "a", userId: "u1", occurredAt: new Date("2026-07-20T10:00:00Z") },
  { id: "v2", visitorHash: "visitor-1", linkId: "b", userId: "u1", occurredAt: new Date("2026-07-21T10:00:00Z") },
  { id: "v3", visitorHash: "visitor-2", linkId: "a", userId: "u2", occurredAt: new Date("2026-07-21T11:00:00Z") }
];
const attributions = [
  { userId: "u1", firstLinkId: "a", lastLinkId: "b", registeredAt: new Date("2026-07-21T12:00:00Z") },
  { userId: "u2", firstLinkId: "a", lastLinkId: "a", registeredAt: new Date("2026-07-21T13:00:00Z") }
];
const orders = [
  { userId: "u1", status: "paid", amountRub: 1000, paidAt: new Date("2026-07-22T10:00:00Z") },
  { userId: "u1", status: "paid", amountRub: 500, paidAt: new Date("2026-07-23T10:00:00Z") },
  { userId: "u2", status: "pending", amountRub: 900, paidAt: null }
];

describe("acquisition analytics aggregation", () => {
  it("calculates the full funnel and selected attribution model", () => {
    const dashboard = buildAcquisitionDashboard(
      { links: [linkA, linkB], visits, attributions, orders },
      { attribution: "last", from: new Date("2026-07-21T00:00:00Z"), to: new Date("2026-07-23T23:59:59Z"), origin: "https://club.example" }
    );
    expect(dashboard.summary).toMatchObject({ visits: 2, uniqueVisitors: 2, registrations: 2, paidUsers: 1, revenueRub: 1500, visitToRegistrationRate: 100, registrationToPaidRate: 50, visitToPaidRate: 50 });
    expect(dashboard.sources.find((row) => row.key === "vk")).toMatchObject({ registrations: 1, paidUsers: 1, revenueRub: 1500 });
    expect(dashboard.timeline.map((row) => row.date)).toEqual(["2026-07-21", "2026-07-22", "2026-07-23"]);
  });

  it("switches registrations and revenue to first touch", () => {
    const dashboard = buildAcquisitionDashboard(
      { links: [linkA, linkB], visits, attributions, orders },
      { attribution: "first", from: null, to: null, origin: "https://club.example" }
    );
    expect(dashboard.sources.find((row) => row.key === "telegram")).toMatchObject({ registrations: 2, paidUsers: 1, revenueRub: 1500 });
  });

  it("shows how many registrations overlap between first and last source", () => {
    const dashboard = buildAcquisitionDashboard(
      { links: [linkA, linkB], visits, attributions, orders },
      { attribution: "first", from: null, to: null, origin: "https://club.example" }
    );
    expect(dashboard.sources.find((row) => row.key === "telegram")).toMatchObject({ overlapRegistrations: 1 });
    expect(dashboard.sources.find((row) => row.key === "vk")).toMatchObject({ overlapRegistrations: 0 });
  });

  it("builds immutable client milestones and visit history", () => {
    const client = buildUserAcquisition({
      user: { id: "u1", createdAt: new Date("2026-07-21T12:00:00Z") },
      links: [linkA, linkB],
      visits: visits.filter((visit) => visit.userId === "u1"),
      attribution: attributions[0]!,
      orders
    });
    expect(client.firstTouch?.source).toBe("telegram");
    expect(client.lastTouch?.source).toBe("vk");
    expect(client.registrationDelaySeconds).toBe(93600);
    expect(client.firstPaymentDelaySeconds).toBe(79200);
    expect(client).toMatchObject({ paidOrders: 2, revenueRub: 1500 });
  });

  it("returns the exact people and anonymous visitors behind one timeline day", () => {
    const detail = buildAcquisitionDayDetail(
      { links: [linkA, linkB], visits, attributions, orders },
      [
        { id: "u1", telegramId: "1001", displayName: "Иван", firstName: "Иван", username: "ivan" },
        { id: "u2", telegramId: "1002", displayName: null, firstName: "Анна", username: "anna" }
      ],
      "2026-07-21"
    );
    expect(detail.visits).toHaveLength(2);
    expect(detail.registrations.map((item) => item.user.telegramId)).toEqual(["1001", "1002"]);
    expect(detail.payments).toHaveLength(0);
    expect(detail.visits[0]).toMatchObject({ source: "vk", user: { label: "Иван" } });
  });
});
