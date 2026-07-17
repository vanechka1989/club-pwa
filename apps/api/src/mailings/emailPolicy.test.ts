import { describe, expect, it } from "vitest";
import {
  EMAIL_DAILY_RECIPIENT_LIMIT,
  EMAIL_MAX_RECIPIENTS_PER_MESSAGE,
  EMAIL_MESSAGES_PER_SECOND,
  getEmailQuotaSnapshot,
  planEmailDeliverySchedule
} from "./emailPolicy";

describe("provider email limits", () => {
  it("exposes the configured provider limits", () => {
    expect(EMAIL_MAX_RECIPIENTS_PER_MESSAGE).toBe(100);
    expect(EMAIL_DAILY_RECIPIENT_LIMIT).toBe(2_000);
    expect(EMAIL_MESSAGES_PER_SECOND).toBe(5);
  });

  it("estimates five personalized email messages per second", () => {
    const nowMs = Date.UTC(2026, 6, 17, 10, 0, 0);
    const plan = planEmailDeliverySchedule({ emailCount: 16, existingDeliveryTimes: [], nowMs });

    expect(plan.durationSeconds).toBe(4);
    expect(plan.completesAt).toBe(new Date(nowMs + 3_000).toISOString());
  });

  it("moves overflow past the rolling 24 hour limit instead of exceeding it", () => {
    const nowMs = Date.UTC(2026, 6, 17, 10, 0, 0);
    const existing = Array.from({ length: 2_000 }, (_, index) => nowMs - 60_000 + index);
    const plan = planEmailDeliverySchedule({ emailCount: 2, existingDeliveryTimes: existing, nowMs });

    expect(plan.durationSeconds).toBeGreaterThanOrEqual(86_340);
    expect(plan.delayedByDailyLimit).toBe(true);
  });

  it("reports used, remaining and the next quota release", () => {
    const nowMs = Date.UTC(2026, 6, 17, 10, 0, 0);
    const snapshot = getEmailQuotaSnapshot({
      deliveryTimes: [nowMs - 60_000, nowMs - 30_000],
      nowMs
    });

    expect(snapshot).toMatchObject({ used: 2, remaining: 1_998, limit: 2_000, windowHours: 24 });
    expect(snapshot.resetsAt).toBe(new Date(nowMs - 60_000 + 86_400_000).toISOString());
  });
});
