import type { PaymentOrderLog } from "@club/shared";
import type { AdminStatisticsPeriod } from "./adminStatistics";

export type AdminPaymentBreakdownKey = "paid" | "one_time" | "recurrent" | "pending" | "webhook_failed" | "failed";

export type AdminPaymentBreakdownItem = {
  key: AdminPaymentBreakdownKey;
  label: string;
  value: number;
};

type DrilldownOptions = {
  period?: AdminStatisticsPeriod;
  now?: Date;
};

function periodStart(period: AdminStatisticsPeriod, now: Date) {
  if (period === "all") {
    return null;
  }

  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function orderDate(order: PaymentOrderLog) {
  return order.paidAt ?? order.createdAt;
}

function isInPeriod(order: PaymentOrderLog, options: DrilldownOptions) {
  const period = options.period ?? "all";
  const start = periodStart(period, options.now ?? new Date());

  if (!start) {
    return true;
  }

  const date = new Date(orderDate(order));
  return date >= start && date <= (options.now ?? new Date());
}

export function filterPaymentOrdersByBreakdown(
  key: AdminPaymentBreakdownKey,
  orders: PaymentOrderLog[],
  options: DrilldownOptions = {}
) {
  const periodOrders = orders.filter((order) => isInPeriod(order, options));

  switch (key) {
    case "paid":
      return periodOrders.filter((order) => order.status === "paid");
    case "one_time":
      return periodOrders.filter((order) => order.status === "paid" && order.productKind === "one_time");
    case "recurrent":
      return periodOrders.filter((order) => order.status === "paid" && order.productKind === "recurrent");
    case "pending":
      return periodOrders.filter((order) => order.status === "pending");
    case "webhook_failed":
      return periodOrders.filter((order) => Boolean(order.webhook && !order.webhook.isValid));
    case "failed":
      return periodOrders.filter((order) => order.status === "failed");
  }
}
