import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const trackingPayloadSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.enum(["open", "push"]), recipientId: z.string().uuid() }),
  z.object({ purpose: z.literal("click"), recipientId: z.string().uuid(), destination: z.string().min(1) }),
]);

export type MailingTrackingPayload = z.infer<typeof trackingPayloadSchema>;

function getSecret(explicitSecret?: string) {
  const secret = explicitSecret ?? process.env.MAILING_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("MAILING_UNSUBSCRIBE_SECRET is not configured");
  return secret;
}

function isSafeDestination(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`mailing-tracking:v1:${encodedPayload}`)
    .digest("base64url");
}

export function createMailingTrackingToken(payload: MailingTrackingPayload, explicitSecret?: string) {
  const parsed = trackingPayloadSchema.parse(payload);
  if (parsed.purpose === "click" && !isSafeDestination(parsed.destination)) {
    throw new Error("Mailing click destination must use HTTP or HTTPS");
  }
  const encodedPayload = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, getSecret(explicitSecret))}`;
}

export function verifyMailingTrackingToken(token: string, explicitSecret?: string): MailingTrackingPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expected = sign(encodedPayload, getSecret(explicitSecret));
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return null;

  try {
    const parsed = trackingPayloadSchema.parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
    if (parsed.purpose === "click" && !isSafeDestination(parsed.destination)) return null;
    return parsed;
  } catch {
    return null;
  }
}
