import { describe, expect, it } from "vitest";
import { reconcilePendingLavaOrders, runBoundedReconciliation } from "./paymentReconciliationCore";

describe("payment reconciliation", () => {
  it("uses bounded concurrency and continues after a transient failure", async () => {
    let active = 0;
    let maxActive = 0;
    const summary = await runBoundedReconciliation([1, 2, 3, 4, 5], async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (item === 3) throw new Error("temporary");
      return item === 2 ? "corrected" : "unchanged";
    }, 2);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(summary).toEqual({ checked: 5, corrected: 1, failed: 1 });
  });

  it("passes foreign snapshots to Lava and continues after one order fails", async () => {
    const processed: string[] = [];
    const statusInputs: Array<{ externalOrderId: string; currency: string; amountMinor: number }> = [];
    const summary = await reconcilePendingLavaOrders({
      providerId: "provider-1",
      apiKey: "api-key",
      orders: [
        { externalOrderId: "failed-order", productId: "product-1", buyerEmail: "a@example.com", currency: "USD" as const, amountMinor: 1999 },
        { externalOrderId: "eur-order", productId: "product-2", buyerEmail: "b@example.com", currency: "EUR" as const, amountMinor: 1750 }
      ],
      getOrderStatus: async (input) => {
        statusInputs.push(input);
        if (input.externalOrderId === "failed-order") throw new Error("transient");
        return {
          eventKey: "reconcile:eur-order:COMPLETED",
          provider: "lava",
          type: "payment_succeeded",
          externalOrderId: "eur-order",
          externalPaymentId: "payment-eur",
          externalSubscriptionId: null,
          productId: "product-2",
          buyerEmail: "b@example.com",
          currency: "EUR",
          amountMinor: 1750,
          occurredAt: new Date("2026-07-27T00:00:00.000Z"),
          payload: { source: "reconciliation" }
        };
      },
      processEvent: async (event, providerId) => {
        expect(providerId).toBe("provider-1");
        expect(event).toMatchObject({ currency: "EUR", amountMinor: 1750 });
        processed.push(event.externalOrderId);
        return "processed";
      }
    });

    expect(statusInputs).toEqual([
      { credentials: { apiKey: "api-key" }, externalOrderId: "failed-order", productId: "product-1", buyerEmail: "a@example.com", currency: "USD", amountMinor: 1999 },
      { credentials: { apiKey: "api-key" }, externalOrderId: "eur-order", productId: "product-2", buyerEmail: "b@example.com", currency: "EUR", amountMinor: 1750 }
    ]);
    expect(processed).toEqual(["eur-order"]);
    expect(summary).toEqual({ checked: 2, corrected: 1, failed: 1 });
  });
});
