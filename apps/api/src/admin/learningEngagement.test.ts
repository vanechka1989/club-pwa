import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLearningEngagementRange } from "./learningEngagementRange";

describe("admin learning engagement", () => {
  it("uses inclusive calendar dates and a 30-day default", () => {
    expect(resolveLearningEngagementRange("2026-07-01", "2026-07-21")).toEqual({
      from: new Date("2026-07-01T00:00:00.000Z"),
      toExclusive: new Date("2026-07-22T00:00:00.000Z")
    });
    expect(resolveLearningEngagementRange(undefined, undefined, new Date("2026-07-21T12:00:00.000Z"))).toEqual({
      from: new Date("2026-06-22T00:00:00.000Z"),
      toExclusive: new Date("2026-07-22T00:00:00.000Z")
    });
  });

  it("rejects invalid or reversed ranges", () => {
    expect(() => resolveLearningEngagementRange("2026-07-22", "2026-07-21")).toThrow("Invalid learning engagement date range");
    expect(() => resolveLearningEngagementRange("not-a-date", "2026-07-21")).toThrow("Invalid learning engagement date range");
  });

  it("wires summary and member drilldown endpoints behind statistics permission", () => {
    const source = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");
    expect(source).toContain('.use("/analytics/learning-engagement"');
    expect(source).toContain('.get("/analytics/learning-engagement"');
    expect(source).toContain('.get("/analytics/learning-engagement/:itemId/users"');
  });
});
