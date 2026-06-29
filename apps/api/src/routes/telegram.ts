import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { sendTelegramMessage } from "../telegram/client";
import { getTelegramBotStatusUpdate, type TelegramBotStatus } from "../telegram/botStatus";

const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({
        id: z.union([z.string(), z.number()])
      }),
      date: z.number().int().optional(),
      text: z.string().optional()
    })
    .optional()
});

async function markTelegramBotStatus({
  telegramId,
  status,
  changedAt
}: {
  telegramId: string;
  status: TelegramBotStatus;
  changedAt: Date;
}) {
  await db
    .update(users)
    .set({
      telegramBotStatus: status,
      telegramBotBlockedAt: status === "blocked" ? changedAt : undefined,
      telegramBotUnblockedAt: status === "active" ? changedAt : undefined,
      updatedAt: new Date()
    })
    .where(eq(users.telegramId, telegramId));
}

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

  const payload = await c.req.json().catch(() => null);
  const botStatusUpdate = getTelegramBotStatusUpdate(payload);
  if (botStatusUpdate) {
    await markTelegramBotStatus(botStatusUpdate);
  }

  const parsed = telegramUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ ok: true });
  }

  const message = parsed.data.message;
  if (message?.text?.startsWith("/start")) {
    await markTelegramBotStatus({
      telegramId: String(message.chat.id),
      status: "active",
      changedAt: message.date ? new Date(message.date * 1000) : new Date()
    });
    await sendStartMessage(message.chat.id);
  }

  return c.json({ ok: true });
});
