import { beforeEach, describe, expect, it } from "vitest";
import { clearPaymentWatch, isOrderWithinPaymentWatch, readPaymentWatch, startPaymentWatch } from "./paymentWatch";

describe("payment watch", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
