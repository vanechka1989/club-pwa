import { describe, expect, it } from "vitest";
import { createRequestMetrics } from "./requestMetrics";

describe("request metrics", () => {
  it("tracks request totals, failures and latency", () => {
    const metrics = createRequestMetrics();
    metrics.record(200, 40);
    metrics.record(503, 60);

    expect(metrics.snapshot()).toEqual({
      requests: 2,
      failedRequests: 1,
      averageDurationMs: 50,
      maxDurationMs: 60
    });
  });
});
