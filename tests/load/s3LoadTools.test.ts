import { describe, expect, it } from "vitest";

import {
  buildRampBatches,
  buildVerificationRetryDelays,
  evaluateS3Thresholds,
  latencySummary,
  makeDeterministicPayload,
  resolveS3LoadProfile
} from "./s3LoadTools.js";

describe("S3 load profiles", () => {
  it("uses the approved smoke profile", () => {
    expect(resolveS3LoadProfile("smoke")).toMatchObject({
      imageClients: 3,
      imageSizeBytes: 1 * 1024 * 1024,
      imageRampTargets: [3],
      videoClients: 2,
      videoSizeBytes: 9 * 1024 * 1024
    });
  });

  it("uses 100 image clients and 25 multipart video clients in production", () => {
    expect(resolveS3LoadProfile("production-100")).toMatchObject({
      imageClients: 100,
      imageSizeBytes: 2 * 1024 * 1024,
      imageRampTargets: [5, 10, 25, 50, 75, 100],
      videoClients: 25,
      videoSizeBytes: 24 * 1024 * 1024,
      apiRssLimitBytes: 1_500_000_000,
      maxErrorRate: 0.01
    });
  });

  it("rejects unknown profiles", () => {
    expect(() => resolveS3LoadProfile("huge")).toThrow("Unknown S3 load profile");
  });
});

describe("S3 stage planning", () => {
  it("converts cumulative ramp targets into independent batches", () => {
    expect(buildRampBatches([5, 10, 25, 50, 75, 100])).toEqual([5, 5, 15, 25, 25, 25]);
  });

  it("rejects a decreasing ramp", () => {
    expect(() => buildRampBatches([10, 5])).toThrow("strictly increasing");
  });
});

describe("S3 verification planning", () => {
  it("allows an eventually-consistent object listing to settle", () => {
    expect(buildVerificationRetryDelays()).toEqual([0, 250, 500, 1000, 2000, 3000]);
  });
});

describe("S3 load statistics", () => {
  it("calculates stable latency percentiles", () => {
    expect(latencySummary([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      min: 10,
      p50: 30,
      p95: 50,
      p99: 50,
      max: 50,
      average: 30
    });
  });

  it("builds repeatable payloads without changing their requested size", () => {
    const first = makeDeterministicPayload(32, 7);
    const second = makeDeterministicPayload(32, 7);
    const other = makeDeterministicPayload(32, 8);
    expect(first).toHaveLength(32);
    expect(first.equals(second)).toBe(true);
    expect(first.equals(other)).toBe(false);
  });
});

describe("S3 safety thresholds", () => {
  const healthy = {
    expectedUploads: 100,
    completedUploads: 100,
    verifiedUploads: 100,
    requestCount: 300,
    failedRequestCount: 0,
    healthFailures: 0,
    containerRestarts: 0,
    peakApiRssBytes: 900_000_000,
    cleanup: { completedObjectsRemaining: 0, unfinishedUploadsRemaining: 0, errors: [] }
  };

  it("passes a complete clean run", () => {
    expect(evaluateS3Thresholds(healthy)).toMatchObject({ passed: true, errorRate: 0 });
  });

  it.each([
    ["completion", { completedUploads: 99 }],
    ["verification", { verifiedUploads: 99 }],
    ["requestErrors", { failedRequestCount: 4 }],
    ["health", { healthFailures: 1 }],
    ["restarts", { containerRestarts: 1 }],
    ["memory", { peakApiRssBytes: 1_500_000_001 }],
    ["cleanup", { cleanup: { completedObjectsRemaining: 1, unfinishedUploadsRemaining: 0, errors: [] } }]
  ])("fails the %s gate", (_name, override) => {
    expect(evaluateS3Thresholds({ ...healthy, ...override }).passed).toBe(false);
  });
});
