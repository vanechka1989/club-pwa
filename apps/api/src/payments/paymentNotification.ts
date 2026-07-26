import { createAppNotification } from "../notifications/create";
import type { PaymentCurrency } from "@club/shared";
import { minorToMajor } from "./money";

export function formatPaymentReceivedMessage({
  productTitle,
  currency,
  amountMinor,
  expiresAt
}: {
  productTitle: string;
  currency: PaymentCurrency;
  amountMinor: number;
  expiresAt: Date;
}) {
  return [
    "Оплата получена.",
    `Тариф: ${productTitle}`,
    `Сумма: ${new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(minorToMajor(amountMinor))}`,
    `Доступ активен до ${expiresAt.toLocaleDateString("ru-RU")}.`
  ].join("\n");
}

export async function notifyPaymentReceived({
  userId,
  productTitle,
  currency,
  amountMinor,
  expiresAt
}: {
  userId: string;
  productTitle: string;
  currency: PaymentCurrency;
  amountMinor: number;
  expiresAt: Date;
}) {
  await createAppNotification({
    userId,
    kind: "payment",
    title: "Оплата получена",
    body: formatPaymentReceivedMessage({ productTitle, currency, amountMinor, expiresAt }),
    source: "payment",
    sourceId: null
  });
}
