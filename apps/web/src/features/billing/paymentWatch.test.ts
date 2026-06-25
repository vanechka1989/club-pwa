import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPaymentWatch, isOrderWithinPaymentWatch, readPaymentWatch, startPaymentWatch } from "./paymentWatch";

describe("payment watch", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores and clears payment watch state", () => {
    startPaymentWatch(new Date("2026-06-25T14:00:00.000Z"));

    expect(readPaymentWatch()).toEqual({ startedAt: "2026-06-25T14:00:00.000Z" });

    clearPaymentWatch();

    expect(readPaymentWatch()).toBeNull();
  });

  it("matches orders created after payment watch started with small clock skew", () => {
    const watch = { startedAt: "2026-06-25T14:00:00.000Z" };

    expect(isOrderWithinPaymentWatch({ createdAt: "2026-06-25T13:59:30.000Z" }, watch)).toBe(true);
    expect(isOrderWithinPaymentWatch({ createdAt: "2026-06-25T13:58:30.000Z" }, watch)).toBe(false);
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(readPaymentWatch()).toBeNull();
    expect(() => startPaymentWatch(new Date("2026-06-25T14:00:00.000Z"))).not.toThrow();
    expect(() => clearPaymentWatch()).not.toThrow();
  });
});
