import type { PaymentCurrency, PaymentMoney } from "@club/shared";

export type LegacyPaymentMoney = Partial<PaymentMoney> & { amountRub?: number | null };

export function formatPaymentMoney(money: Pick<PaymentMoney, "currency" | "amountMinor">) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: money.currency }).format(money.amountMinor / 100);
}

export function formatPaymentMoneyWithLegacyFallback(money: LegacyPaymentMoney) {
  if (money.currency && typeof money.amountMinor === "number") return formatPaymentMoney(money as PaymentMoney);
  return typeof money.amountRub === "number"
    ? formatPaymentMoney({ currency: "RUB" as PaymentCurrency, amountMinor: money.amountRub * 100 })
    : "Цена уточняется";
}
