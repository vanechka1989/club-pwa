import { createHash, randomInt } from "node:crypto";

const loginCodeLength = 6;

export function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email || email.length > 320) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function createLoginCode() {
  return String(randomInt(0, 10 ** loginCodeLength)).padStart(loginCodeLength, "0");
}

export function hashAuthToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildEmailLoginMessage(input: { code: string; expiresInMinutes: number }) {
  return {
    subject: "Код входа в клуб",
    text: [
      `Ваш код входа: ${input.code}`,
      "",
      `Он действует ${input.expiresInMinutes} минут.`,
      "Если вы не запрашивали вход, просто проигнорируйте это письмо."
    ].join("\n")
  };
}
