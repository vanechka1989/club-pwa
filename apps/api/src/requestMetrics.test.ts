import { describe, expect, it } from "vitest";
import { createRequestMetrics } from "./requestMetrics";

describe("request metrics", () => {
  it("tracks a rolling window, error rate and p95 latency", () => {
    let now = 1_000_000;
    const metrics = createRequestMetrics({ now: () => now, windowMs: 60_000 });
    metrics.record(200, 40);
    metrics.record(503, 60);
    metrics.record(200, 100);

    expect(metrics.snapshot()).toEqual({
      requests: 3,
      failedRequests: 1,
      requestsPerMinute: 3,
      errorRatePercent: 33.3,
      averageDurationMs: 67,
      p95DurationMs: 100,
      maxDurationMs: 100,
      windowSeconds: 60
    });

    now += 60_001;
    expect(metrics.snapshot().requests).toBe(0);
  });
});
