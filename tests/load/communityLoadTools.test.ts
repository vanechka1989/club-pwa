import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSseParser,
  deliverySummary,
  evaluateThresholds,
  latencySummary,
  resolveLoadProfile
} from "./communityLoadTools.js";

describe("community load tools", () => {
  it("parses SSE frames split between network chunks", () => {
    const events: Array<{ event: string; id: string; data: string }> = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push("event: commu");
    parser.push("nity.changed\nid: event-1\ndata: {\"topicId\":\"topic-1\"}\n\n");

    expect(events).toEqual([{
      event: "community.changed",
      id: "event-1",
      data: '{"topicId":"topic-1"}'
    }]);
  });

  it("summarises delivery without hiding losses or duplicates", () => {
    expect(deliverySummary({ expectedClients: 3, expectedEventsPerClient: 2, receivedByClient: [2, 2, 1], duplicateCount: 1 })).toEqual({
      expected: 6,
      received: 5,
      lost: 1,
      duplicates: 1,
      deliveryRate: 5 / 6,
      completeClients: 2
    });
  });

  it("calculates stable latency percentiles", () => {
    expect(latencySummary([5, 10, 15, 20, 100])).toEqual({
      count: 5,
      min: 5,
      p50: 15,
      p95: 100,
      p99: 100,
      max: 100,
      average: 30
    });
  });

  it("uses a ramped 100-client production profile", () => {
    expect(resolveLoadProfile("production-100")).toMatchObject({
      clients: 100,
      rampTargets: [10, 25, 50, 75, 100],
      holdMs: 180_000,
      burstMessages: 20,
      reconnectClients: 25
    });
  });

  it("evaluates every production threshold independently", () => {
    expect(evaluateThresholds({
      sequential: { p95: 444, p99: 503 },
      burst: { delivery: { deliveryRate: 1, duplicates: 0 } },
      http: { requests: 1200, failedClients: 0, latency: { p95: 2683, p99: 2824 } },
      clientFailures: []
    })).toEqual(expect.objectContaining({
      passed: false,
      checks: expect.objectContaining({
        delivery: true,
        duplicates: true,
        sseP95: true,
        sseP99: true,
        httpErrors: true,
        httpP95: false,
        httpP99: false,
        clientFailures: true
      })
    }));
  });

  it("guards production and always attempts cleanup", () => {
    const source = readFileSync(resolve(process.cwd(), "tests/load/community-100.mjs"), "utf8");
    expect(source).toContain('CONFIRM_PRODUCTION_LOAD !== "YES"');
    expect(source).toContain("finally");
    expect(source).toContain("cleanupTestMessages");
    expect(source).toContain("AbortController");
    expect(source).toContain("report.thresholdEvaluation?.passed === false");
  });
});
