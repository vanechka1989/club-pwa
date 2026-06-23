import { env } from "../env";

export async function sendTelegramMessage({
  chatId,
  text,
  replyMarkup
}: {
  chatId: string | number;
  text: string;
  replyMarkup?: unknown;
}) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status}`);
  }
}
