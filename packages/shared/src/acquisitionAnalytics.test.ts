import { describe, expect, it } from "vitest";
import {
  acquisitionDestinationSchema,
  adminAcquisitionDashboardSchema,
  adminAcquisitionLinkSchema,
  adminUserAcquisitionSchema
} from "./index";

const touch = {
  linkId: "f08ac73a-4ca1-4ed2-b6c2-47cd32b45290",
  aid: "telegram-july",
  linkName: "Telegram · июль",
  source: "telegram",
  medium: "post",
  campaign: "july",
  content: "report",
  visitedAt: "2026-07-21T01:00:00.000Z"
};

describe("acquisition analytics contracts", () => {
  it("accepts safe destinations and rejects external redirects", () => {
    expect(acquisitionDestinationSchema.parse({ kind: "module", moduleId: "f08ac73a-4ca1-4ed2-b6c2-47cd32b45290" })).toEqual({
      kind: "module",
      moduleId: "f08ac73a-4ca1-4ed2-b6c2-47cd32b45290"
    });
    expect(() => acquisitionDestinationSchema.parse({ kind: "https://evil.example" })).toThrow();
  });

  it("parses link, dashboard, and client attribution payloads", () => {
    expect(
      adminAcquisitionLinkSchema.parse({
        id: touch.linkId,
        aid: touch.aid,
        name: touch.linkName,
        source: touch.source,
        medium: touch.medium,
        campaign: touch.campaign,
        content: touch.content,
        destination: { kind: "billing" },
        url: "https://club.example/?aid=telegram-july&utm_source=telegram",
        isActive: true,
        visits: 12,
        uniqueVisitors: 10,
        registrations: 4,
        paidUsers: 2,
        revenueRub: 5000,
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z"
      }).aid
    ).toBe("telegram-july");

    expect(
      adminAcquisitionDashboardSchema.parse({
        attribution: "last",
        period: { from: null, to: null },
        summary: { visits: 12, uniqueVisitors: 10, registrations: 4, paidUsers: 2, revenueRub: 5000, visitToRegistrationRate: 40, registrationToPaidRate: 50, visitToPaidRate: 20 },
        timeline: [{ date: "2026-07-21", visits: 12, registrations: 4, paidUsers: 2, revenueRub: 5000 }],
        sources: [{ key: "telegram", label: "telegram", visits: 12, registrations: 4, paidUsers: 2, revenueRub: 5000 }],
        campaigns: [],
        topLinks: []
      }).summary.revenueRub
    ).toBe(5000);

    expect(
      adminUserAcquisitionSchema.parse({
        firstTouch: touch,
        lastTouch: touch,
        registeredAt: "2026-07-21T01:10:00.000Z",
        firstPaidAt: "2026-07-21T02:00:00.000Z",
        registrationDelaySeconds: 600,
        firstPaymentDelaySeconds: 3600,
        paidOrders: 2,
        revenueRub: 5000,
        visits: [touch]
      }).firstTouch?.source
    ).toBe("telegram");
  });
});
