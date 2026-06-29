import { describe, expect, it } from "vitest";
import { estimateMailingDurationSeconds, formatMailingDuration } from "./estimate";

describe("mailing delivery estimate", () => {
  it("estimates Telegram campaigns from the real recipient count and send rate", () => {
    expect(estimateMailingDurationSeconds({ recipientCount: 1248, channel: "bot" })).toBe(69);
    expect(estimateMailingDurationSeconds({ recipientCount: 1248, channel: "all" })).toBe(69);
    expect(formatMailingDuration(69)).toBe("~1 мин 9 сек");
  });

  it("uses a faster local estimate for app-only campaigns", () => {
    expect(estimateMailingDurationSeconds({ recipientCount: 1248, channel: "app" })).toBe(5);
    expect(formatMailingDuration(5)).toBe("~5 сек");
  });
});
