import type { PaymentOrderLog } from "@club/shared";
import { formatPaymentMoneyWithLegacyFallback } from "@/features/billing/paymentMoney";

export function formatAdminPaymentMoney(order: Pick<PaymentOrderLog, "currency" | "amountMinor" | "amountRub">) {
  return formatPaymentMoneyWithLegacyFallback(order);
}

export function paymentRubMajor(order: Pick<PaymentOrderLog, "currency" | "amountMinor" | "amountRub">) {
  if (order.currency && typeof order.amountMinor === "number") return order.currency === "RUB" ? order.amountMinor / 100 : 0;
  return order.amountRub ?? 0;
}
