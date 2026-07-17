import type { PaymentOrderLog } from "@club/shared";
import { describe, expect, it } from "vitest";
import { filterPaymentOrdersByBreakdown, resolvePaymentBreakdownItem } from "./adminPaymentDrilldown";

function payment(overrides: Partial<PaymentOrderLog>): PaymentOrderLog {
  return {
    id: "order-id",
    status: "pending",
    amountRub: 0,
    providerOrderId: "club-order",
    providerPaymentId: null,
    productTitle: "Тариф",
    productKind: "one_time",
    customer: {
      id: "customer-id",
      telegramId: "100",
      firstName: "Иван",
      username: null,
      photoUrl: null,
      avatarPositionX: 50,
      avatarPositionY: 50,
      avatarScale: 1
    },
    webhook: null,
    paidAt: null,
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
    ...overrides
  };
}

describe("admin payment drilldown", () => {
  const orders = [
    payment({ id: "paid-one-time", status: "paid", productKind: "one_time" }),
    payment({ id: "paid-recurrent", status: "paid", productKind: "recurrent" }),
    payment({ id: "pending-recurrent", status: "pending", productKind: "recurrent" }),
    payment({ id: "failed-one-time", status: "failed", productKind: "one_time" }),
    payment({ id: "bad-webhook", status: "paid", productKind: "one_time", webhook: { isValid: false, createdAt: "2026-06-25T10:01:00.000Z" } })
  ];

  it("filters paid recurrent payments without mixing pending subscriptions", () => {
    expect(filterPaymentOrdersByBreakdown("recurrent", orders).map((order) => order.id)).toEqual(["paid-recurrent"]);
  });

  it("filters webhook signature errors independently from payment status", () => {
    expect(filterPaymentOrdersByBreakdown("webhook_failed", orders).map((order) => order.id)).toEqual(["bad-webhook"]);
  });

  it("filters payments by custom date range", () => {
    const rangeOrders = [
      payment({ id: "inside", status: "paid", paidAt: "2026-06-10T10:00:00.000Z" }),
      payment({ id: "outside", status: "paid", paidAt: "2026-06-20T10:00:00.000Z" })
    ];

    expect(
      filterPaymentOrdersByBreakdown("paid", rangeOrders, {
        period: "custom",
        dateRange: { from: "2026-06-09", to: "2026-06-15" }
      }).map((order) => order.id)
    ).toEqual(["inside"]);
  });

  it("keeps a valid direct drilldown route usable before statistics finish loading", () => {
    expect(resolvePaymentBreakdownItem("paid", [])).toEqual({ key: "paid", label: "Всего оплат", value: 0 });
    expect(resolvePaymentBreakdownItem("unknown", [])).toBeNull();
  });
});
