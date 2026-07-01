import type { PaymentOrderLog } from "@club/shared";
import type { AdminStatisticsDateRange, AdminStatisticsPeriod } from "./adminStatistics";

export type AdminPaymentBreakdownKey = "paid" | "one_time" | "recurrent" | "pending" | "webhook_failed" | "failed";

export type AdminPaymentBreakdownItem = {
  key: AdminPaymentBreakdownKey;
  label: string;
  value: number;
};

type DrilldownOptions = {
  period?: AdminStatisticsPeriod;
  dateRange?: AdminStatisticsDateRange;
  now?: Date;
};

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodRange(period: AdminStatisticsPeriod, now: Date, dateRange?: AdminStatisticsDateRange) {
  if (period === "all") {
    return { start: null, end: null };
  }

  if (period === "custom") {
    return {
      start: parseDateBoundary(dateRange?.from),
      end: parseDateBoundary(dateRange?.to, true)
    };
  }

  const days = period === "7d" ? 7 : 30;
  return {
    start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    end: now
  };
}

function orderDate(order: PaymentOrderLog) {
  return order.paidAt ?? order.createdAt;
}

function isInPeriod(order: PaymentOrderLog, options: DrilldownOptions) {
  const period = options.period ?? "all";
  const range = periodRange(period, options.now ?? new Date(), options.dateRange);

  if (!range.start && !range.end) {
    return true;
  }

  const date = new Date(orderDate(order));
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
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
