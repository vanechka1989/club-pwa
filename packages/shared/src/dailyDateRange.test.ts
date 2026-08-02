import { describe, expect, it } from "vitest";
import { utcDateKeys } from "./dailyDateRange";

describe("utcDateKeys", () => {
  it("returns every UTC calendar date inclusively across a month boundary", () => {
    expect(utcDateKeys("2026-07-30", "2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02"
    ]);
  });

  it("returns an empty range for invalid or reversed boundaries", () => {
    expect(utcDateKeys("2026-08-02", "2026-08-01")).toEqual([]);
    expect(utcDateKeys("not-a-date", "2026-08-01")).toEqual([]);
  });
});
