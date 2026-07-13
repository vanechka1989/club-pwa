import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(explicitSecret?: string) {
  const secret = explicitSecret ?? process.env.MAILING_UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error("MAILING_UNSUBSCRIBE_SECRET is not configured");
  }
  return secret;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createMailingUnsubscribeToken(userId: string, explicitSecret?: string) {
  const encodedUserId = Buffer.from(userId, "utf8").toString("base64url");
  return `${encodedUserId}.${sign(encodedUserId, getSecret(explicitSecret))}`;
}

export function verifyMailingUnsubscribeToken(token: string, explicitSecret?: string) {
  const [encodedUserId, signature, extra] = token.split(".");
  if (!encodedUserId || !signature || extra) {
    return null;
  }

  const expected = sign(encodedUserId, getSecret(explicitSecret));
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return null;
  }

  try {
    return Buffer.from(encodedUserId, "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}
