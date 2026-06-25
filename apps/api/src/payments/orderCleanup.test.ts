import { describe, expect, it } from "vitest";
import {
  getExpiredPendingPaymentOrderCutoff,
  pendingPaymentOrderCleanupIntervalMs,
  pendingPaymentOrderTtlMs
} from "./orderCleanup";

describe("payment order cleanup", () => {
  it("uses one hour as pending payment order ttl", () => {
    expect(pendingPaymentOrderTtlMs).toBe(60 * 60 * 1000);
  });

  it("uses ten minutes as cleanup interval", () => {
    expect(pendingPaymentOrderCleanupIntervalMs).toBe(10 * 60 * 1000);
  });

  it("calculates cutoff for expired pending payment orders", () => {
    expect(getExpiredPendingPaymentOrderCutoff(new Date("2026-06-25T15:00:00.000Z")).toISOString()).toBe(
      "2026-06-25T14:00:00.000Z"
    );
  });
});
