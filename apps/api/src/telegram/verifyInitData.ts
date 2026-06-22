import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().optional(),
  username: z.string().optional()
});

export type TelegramUser = {
  id: string;
  firstName: string | null;
  username: string | null;
};

export function verifyTelegramInitData(initData: string, botToken: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const received = Buffer.from(hash, "hex");
  const expected = Buffer.from(calculatedHash, "hex");

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    return null;
  }

  let decodedUser: unknown;
  try {
    decodedUser = JSON.parse(rawUser);
  } catch {
    return null;
  }

  const parsed = telegramUserSchema.safeParse(decodedUser);
  if (!parsed.success) {
    return null;
  }

  return {
    id: String(parsed.data.id),
    firstName: parsed.data.first_name ?? null,
    username: parsed.data.username ?? null
  };
}
