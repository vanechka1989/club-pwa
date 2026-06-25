type TelegramMessagePayload = {
  chatId: string | number;
  text: string;
  replyMarkup?: unknown;
};

type SendTelegramMessage = (payload: TelegramMessagePayload) => Promise<void>;

async function defaultSendTelegramMessage(payload: TelegramMessagePayload) {
  const { sendTelegramMessage } = await import("../telegram/client");
  await sendTelegramMessage(payload);
}

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
  telegramId,
  productTitle,
  amountRub,
  expiresAt,
  webOrigin,
  send = defaultSendTelegramMessage
}: {
  telegramId: string;
  productTitle: string;
  amountRub: number;
  expiresAt: Date;
  webOrigin: string;
  send?: SendTelegramMessage;
}) {
  await send({
    chatId: telegramId,
    text: formatPaymentReceivedMessage({ productTitle, amountRub, expiresAt }),
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "Открыть клуб",
            web_app: {
              url: webOrigin
            }
          }
        ]
      ]
    }
  });
}
