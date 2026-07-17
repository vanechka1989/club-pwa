import { describe, expect, it } from "vitest";
import { estimateMailingDurationSeconds, formatMailingDuration } from "./estimate";

describe("mailing delivery estimate", () => {
  it("uses the real queue throughput for push campaigns", () => {
    expect(estimateMailingDurationSeconds({ pushCount: 1248, emailCount: 0 })).toBe(315);
    expect(formatMailingDuration(315)).toBe("~5 мин 15 сек");
  });

  it("uses the configured email throughput", () => {
    expect(estimateMailingDurationSeconds({ pushCount: 0, emailCount: 1248 })).toBe(250);
  });

  it("adds push and email delivery time for combined campaigns", () => {
    expect(estimateMailingDurationSeconds({ pushCount: 1248, emailCount: 1248 })).toBe(565);
  });
});
