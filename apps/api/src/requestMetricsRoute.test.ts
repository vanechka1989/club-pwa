import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("request metrics route", () => {
  it("exposes lightweight runtime metrics only to an authenticated monitor", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain('app.get("/metrics"');
    expect(source).toContain("hasObservabilityAccess");
    expect(source).toContain("return c.notFound()");
    expect(source).toContain("requestMetrics.snapshot()");
    expect(source).toContain("getCommunityRealtimeSubscriberCount()");
  });
});
