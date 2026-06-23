import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import { sendTelegramMessage } from "../telegram/client";

const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({
        id: z.union([z.string(), z.number()])
      }),
      text: z.string().optional()
    })
    .optional()
});

async function sendStartMessage(chatId: string | number) {
  await sendTelegramMessage({
    chatId,
    text: "Клуб готов к открытию.",
    replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Открыть клуб",
              web_app: {
                url: env.WEB_ORIGIN
              }
            }
          ]
        ]
      }
  });
}

export const telegramRoute = new Hono().post("/webhook", async (c) => {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const secret = c.req.header("x-telegram-bot-api-secret-token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return c.json({ ok: false }, 401);
    }
  }

  const parsed = telegramUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ ok: true });
  }

  const message = parsed.data.message;
  if (message?.text?.startsWith("/start")) {
    await sendStartMessage(message.chat.id);
  }

  return c.json({ ok: true });
});
