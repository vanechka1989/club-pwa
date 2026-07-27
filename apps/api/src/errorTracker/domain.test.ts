import { describe, expect, it } from "vitest";
import {
  classifyErrorSeverity,
  fingerprintErrorEvent,
  sanitizeErrorEvent,
  shouldNotifyIncident
} from "./domain";

describe("error tracker domain", () => {
  it("removes secrets, email addresses and URL parameters before storage", () => {
    const event = sanitizeErrorEvent({
      source: "client",
      kind: "window-error",
      message: "Bearer top-secret for buyer@example.com token=abcdef1234567890",
      route: "https://club.example/pay?token=top-secret#private",
      detail: { authorization: "Bearer hidden", password: "guess-me", note: "buyer@example.com" }
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("guess-me");
    expect(event.route).toBe("/pay");
    expect(event.message).toContain("[REDACTED]");
  });

  it("groups volatile identifiers and numbers under one fingerprint", () => {
    const first = sanitizeErrorEvent({
      source: "api",
      kind: "request-error",
      message: "Order 8ee94d3c-7bea-47a8-aada-e8d145ad0ab1 failed after 215 ms",
      route: "/payments/orders/8ee94d3c-7bea-47a8-aada-e8d145ad0ab1",
      stack: "Error: failed\n at checkout (/app/payments.ts:125:9)"
    });
    const second = sanitizeErrorEvent({
      source: "api",
      kind: "request-error",
      message: "Order b205a2db-29f9-4b58-9ced-311c558264c3 failed after 481 ms",
      route: "/payments/orders/b205a2db-29f9-4b58-9ced-311c558264c3",
      stack: "Error: failed\n at checkout (/app/payments.ts:125:9)"
    });

    expect(fingerprintErrorEvent(first)).toBe(fingerprintErrorEvent(second));
  });

  it("marks startup and sensitive-flow crashes as critical", () => {
    expect(classifyErrorSeverity(sanitizeErrorEvent({ source: "client", kind: "blank-screen", message: "Vue did not mount" }))).toBe("critical");
    expect(classifyErrorSeverity(sanitizeErrorEvent({ source: "api", kind: "request-error", message: "Provider crashed", route: "/payments/lava/order" }))).toBe("critical");
    expect(classifyErrorSeverity(sanitizeErrorEvent({ source: "client", kind: "recoverable", message: "Retry available" }))).toBe("warning");
  });

  it("alerts critical incidents immediately and applies thresholds plus cooldown", () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    expect(shouldNotifyIncident({ severity: "critical", count: 1, affectedUsers: 0, now, lastNotifiedAt: null })).toBe(true);
    expect(shouldNotifyIncident({ severity: "error", count: 2, affectedUsers: 1, now, lastNotifiedAt: null })).toBe(false);
    expect(shouldNotifyIncident({ severity: "error", count: 3, affectedUsers: 1, now, lastNotifiedAt: null })).toBe(true);
    expect(shouldNotifyIncident({ severity: "error", count: 2, affectedUsers: 2, now, lastNotifiedAt: null })).toBe(true);
    expect(shouldNotifyIncident({ severity: "critical", count: 10, affectedUsers: 3, now, lastNotifiedAt: new Date(now.getTime() - 10 * 60_000) })).toBe(false);
    expect(shouldNotifyIncident({ severity: "critical", count: 10, affectedUsers: 3, now, lastNotifiedAt: new Date(now.getTime() - 31 * 60_000) })).toBe(true);
  });
});
