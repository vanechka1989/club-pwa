import { describe, expect, it } from "vitest";
import { buildPaymentDiagnostic, summarizePaymentDiagnostics } from "./paymentDiagnostics";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("payment diagnostics", () => {
  it("separates fresh and expired pending checkouts", () => {
    expect(
      buildPaymentDiagnostic({
        status: "pending",
        createdAt: new Date("2026-07-19T11:55:00.000Z"),
        updatedAt: new Date("2026-07-19T11:55:00.000Z"),
        webhook: null,
        now
      }).state
    ).toBe("awaiting_payment");

    expect(
      buildPaymentDiagnostic({
        status: "pending",
        createdAt: new Date("2026-07-18T11:00:00.000Z"),
        updatedAt: new Date("2026-07-18T11:00:00.000Z"),
        webhook: null,
        now
      }).state
    ).toBe("expired");
  });

  it("flags invalid or contradictory webhooks", () => {
    expect(
      buildPaymentDiagnostic({
        status: "pending",
        createdAt: new Date("2026-07-19T11:55:00.000Z"),
        updatedAt: new Date("2026-07-19T11:55:00.000Z"),
        webhook: { isValid: false, createdAt: new Date("2026-07-19T11:56:00.000Z") },
        now
      }).state
    ).toBe("webhook_error");
  });

  it("builds counters for the admin dashboard", () => {
    const summary = summarizePaymentDiagnostics([
      { state: "paid", reason: "ok", severity: "success" },
      { state: "awaiting_payment", reason: "wait", severity: "info" },
      { state: "webhook_error", reason: "bad", severity: "danger" }
    ]);

    expect(summary).toEqual({ total: 3, paid: 1, awaitingPayment: 1, expired: 0, failed: 0, cancelled: 0, webhookErrors: 1 });
  });
});
