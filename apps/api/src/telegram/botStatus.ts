import { z } from "zod";

const telegramMyChatMemberUpdateSchema = z.object({
  my_chat_member: z.object({
    chat: z.object({
      id: z.union([z.string(), z.number()]),
      type: z.string()
    }),
    date: z.number().int(),
    new_chat_member: z.object({
      status: z.string()
    })
  })
});

export type TelegramBotStatus = "active" | "blocked";

export function getTelegramBotStatusUpdate(input: unknown): { telegramId: string; status: TelegramBotStatus; changedAt: Date } | null {
  const parsed = telegramMyChatMemberUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  const update = parsed.data.my_chat_member;
  if (update.chat.type !== "private") {
    return null;
  }

  if (update.new_chat_member.status === "kicked") {
    return {
      telegramId: String(update.chat.id),
      status: "blocked",
      changedAt: new Date(update.date * 1000)
    };
  }

  if (update.new_chat_member.status === "member") {
    return {
      telegramId: String(update.chat.id),
      status: "active",
      changedAt: new Date(update.date * 1000)
    };
  }

  return null;
}
