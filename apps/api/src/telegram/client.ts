import { env } from "../env";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function callTelegramMethod<T>(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null;

  if (response.ok && !data) {
    return undefined as T;
  }

  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status}${data?.description ? ` ${data.description}` : ""}`);
  }

  return data.result as T;
}

export async function sendTelegramMessage({
  chatId,
  text,
  parseMode,
  replyMarkup
}: {
  chatId: string | number;
  text: string;
  parseMode?: "HTML";
  replyMarkup?: unknown;
}) {
  await callTelegramMethod("sendMessage", {
    chat_id: chatId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

export async function sendTelegramMedia({
  chatId,
  kind,
  url,
  caption,
  parseMode,
  replyMarkup
}: {
  chatId: string | number;
  kind: "photo" | "video" | "document";
  url: string;
  caption?: string;
  parseMode?: "HTML";
  replyMarkup?: unknown;
}) {
  const methodByKind = {
    photo: "sendPhoto",
    video: "sendVideo",
    document: "sendDocument"
  } as const;
  const fieldByKind = {
    photo: "photo",
    video: "video",
    document: "document"
  } as const;

  return callTelegramMethod(methodByKind[kind], {
    chat_id: chatId,
    [fieldByKind[kind]]: url,
    ...(caption ? { caption } : {}),
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}
