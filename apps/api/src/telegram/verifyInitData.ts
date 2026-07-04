import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional()
});

export type TelegramUser = {
  id: string;
  firstName: string | null;
  username: string | null;
  photoUrl: string | null;
  startParam: string | null;
};

type VerifyTelegramInitDataOptions = {
  now?: Date;
  maxAgeSeconds?: number;
};

const defaultTelegramInitDataMaxAgeSeconds = 24 * 60 * 60;

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: VerifyTelegramInitDataOptions = {}
): TelegramUser | null {
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

  const authDateValue = params.get("auth_date");
  const authDateSeconds = authDateValue ? Number(authDateValue) : NaN;
  if (!Number.isInteger(authDateSeconds) || authDateSeconds <= 0) {
    return null;
  }

  const nowMs = options.now?.getTime() ?? Date.now();
  const maxAgeMs = (options.maxAgeSeconds ?? defaultTelegramInitDataMaxAgeSeconds) * 1000;
  const ageMs = nowMs - authDateSeconds * 1000;
  if (ageMs < 0 || ageMs > maxAgeMs) {
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
    username: parsed.data.username ?? null,
    photoUrl: parsed.data.photo_url ?? null,
    startParam: params.get("start_param") ?? null
  };
}
