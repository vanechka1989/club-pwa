import { createAppNotification } from "../notifications/create";

export function formatPaymentReceivedMessage({
  productTitle,
  amountRub,
  expiresAt
}: {
  productTitle: string;
  amountRub: number;
  expiresAt: Date;
}) {
  return [
    "Оплата получена.",
    `Тариф: ${productTitle}`,
    `Сумма: ${amountRub.toLocaleString("ru-RU")} ₽`,
    `Доступ активен до ${expiresAt.toLocaleDateString("ru-RU")}.`
  ].join("\n");
}

export async function notifyPaymentReceived({
  userId,
  productTitle,
  amountRub,
  expiresAt
}: {
  userId: string;
  productTitle: string;
  amountRub: number;
  expiresAt: Date;
}) {
  await createAppNotification({
    userId,
    kind: "payment",
    title: "Оплата получена",
    body: formatPaymentReceivedMessage({ productTitle, amountRub, expiresAt }),
    source: "payment",
    sourceId: null
  });
}
