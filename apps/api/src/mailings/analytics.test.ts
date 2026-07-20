import { describe, expect, it } from "vitest";
import { buildMailingAnalytics, getRecipientAnalyticsStatus } from "./analytics";

describe("mailing analytics aggregation", () => {
  const recipients = [
    { id: "r1", channel: "push", status: "sent", sentAt: new Date("2026-07-20T10:05:00Z") },
    { id: "r2", channel: "push", status: "sent", sentAt: new Date("2026-07-20T10:10:00Z") },
    { id: "r3", channel: "email", status: "sent", sentAt: new Date("2026-07-20T11:00:00Z") },
    { id: "r4", channel: "email", status: "failed", sentAt: null },
    { id: "r5", channel: "push", status: "skipped_stopped", sentAt: null },
  ];
  const events = [
    { recipientId: "r1", eventType: "open", destination: null, occurredAt: new Date("2026-07-20T10:20:00Z") },
    { recipientId: "r3", eventType: "open", destination: null, occurredAt: new Date("2026-07-20T11:10:00Z") },
    { recipientId: "r1", eventType: "click", destination: "https://example.com/a", occurredAt: new Date("2026-07-20T10:30:00Z") },
    { recipientId: "r1", eventType: "click", destination: "https://example.com/b", occurredAt: new Date("2026-07-20T10:40:00Z") },
    { recipientId: "r3", eventType: "click", destination: "https://example.com/a", occurredAt: new Date("2026-07-20T11:20:00Z") },
  ];

  it("counts unique recipients and calculates engagement rates", () => {
    const analytics = buildMailingAnalytics(recipients, events);
    expect(analytics.summary).toEqual({
      sent: 3,
      opened: 2,
      clicked: 2,
      openRate: 66.7,
      clickRate: 66.7,
      clickToOpenRate: 100,
    });
    expect(analytics.channels).toEqual([
      { channel: "push", sent: 2, failed: 0, skipped: 1, opened: 1, clicked: 1, openRate: 50, clickRate: 50 },
      { channel: "email", sent: 1, failed: 1, skipped: 0, opened: 1, clicked: 1, openRate: 100, clickRate: 100 },
    ]);
    expect(analytics.links).toEqual([
      { destination: "https://example.com/a", uniqueClicks: 2 },
      { destination: "https://example.com/b", uniqueClicks: 1 },
    ]);
    expect(analytics.timeline.map((item) => item.bucket)).toEqual([
      "2026-07-20T10:00:00.000Z",
      "2026-07-20T11:00:00.000Z",
    ]);
  });

  it("returns zero rates for an empty mailing", () => {
    expect(buildMailingAnalytics([], []).summary).toEqual({ sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0, clickToOpenRate: 0 });
  });

  it("prioritizes clicked and opened recipient filters over delivery", () => {
    expect(getRecipientAnalyticsStatus("sent", true, true)).toBe("clicked");
    expect(getRecipientAnalyticsStatus("sent", true, false)).toBe("opened");
    expect(getRecipientAnalyticsStatus("failed", false, false)).toBe("failed");
    expect(getRecipientAnalyticsStatus("skipped_stopped", false, false)).toBe("skipped");
    expect(getRecipientAnalyticsStatus("pending", false, false)).toBe("pending");
  });
});
