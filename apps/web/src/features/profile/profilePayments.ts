type PaymentStatusRecord = {
  status: string;
};

import type { PaymentOrderLog } from "@club/shared";
import { formatPaymentMoneyWithLegacyFallback } from "@/features/billing/paymentMoney";

export function getLatestPaidOrder<T extends PaymentStatusRecord>(orders: readonly T[]): T | null {
  return orders.find((order) => order.status === "paid") ?? null;
}

export function formatProfilePaymentMoney(order: Pick<PaymentOrderLog, "currency" | "amountMinor" | "amountRub">) {
  return formatPaymentMoneyWithLegacyFallback(order);
}
