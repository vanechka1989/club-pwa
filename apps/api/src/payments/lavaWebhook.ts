import { createHash, timingSafeEqual } from "node:crypto";
import { paymentCurrencySchema } from "@club/shared";
import { z } from "zod";
import type { NormalizedPaymentEvent } from "./providerAdapter";
import { majorToMinor, PaymentMoneyError } from "./money";

const maximumWebhookBytes = 64 * 1024;

const lavaEventTypeSchema = z.enum([
  "payment.success",
  "payment.failed",
  "subscription.recurring.payment.success",
  "subscription.recurring.payment.failed",
  "subscription.cancelled"
]);

const lavaWebhookSchema = z.object({
  eventType: lavaEventTypeSchema,
  product: z.object({
    id: z.string().uuid(),
    title: z.string()
  }),
  contractId: z.string().uuid(),
  parentContractId: z.string().uuid().nullable().optional(),
  buyer: z.object({
    email: z.string().email(),
    phone: z.string().trim().max(64).nullable().optional()
  }),
  amount: z.number().nonnegative(),
  currency: z.string(),
  status: z.string(),
  timestamp: z.string().datetime(),
  clientUtm: z.record(z.unknown()).nullable().optional(),
  errorMessage: z.string().nullable().optional()
}).passthrough();

const eventTypes: Record<z.infer<typeof lavaEventTypeSchema>, NormalizedPaymentEvent["type"]> = {
  "payment.success": "payment_succeeded",
  "payment.failed": "payment_failed",
  "subscription.recurring.payment.success": "renewal_succeeded",
  "subscription.recurring.payment.failed": "renewal_failed",
  "subscription.cancelled": "subscription_cancelled"
};

export class LavaWebhookError extends Error {
  constructor(readonly status: 400 | 401 | 413 | 415, message: string) {
    super(message);
    this.name = "LavaWebhookError";
  }
}

function secureEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function parseLavaWebhook(
  request: Request,
  secrets: string | readonly string[]
): Promise<NormalizedPaymentEvent> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new LavaWebhookError(415, "Webhook must use application/json");
  }
  const suppliedKey = request.headers.get("x-api-key") ?? "";
  const acceptedSecrets = typeof secrets === "string" ? [secrets] : secrets;
  if (!suppliedKey || !acceptedSecrets.some((secret) => secureEqual(suppliedKey, secret))) {
    throw new LavaWebhookError(401, "Invalid webhook authentication");
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > maximumWebhookBytes) {
    throw new LavaWebhookError(413, "Webhook body is too large");
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new LavaWebhookError(400, "Invalid webhook JSON");
  }
  const parsed = lavaWebhookSchema.safeParse(json);
  if (!parsed.success) {
    throw new LavaWebhookError(400, "Invalid webhook payload");
  }

  const payload = parsed.data;
  const currency = paymentCurrencySchema.safeParse(payload.currency.toUpperCase());
  if (!currency.success) throw new LavaWebhookError(400, "Unsupported webhook currency");
  let amountMinor: number;
  try {
    amountMinor = majorToMinor(payload.amount);
  } catch (error) {
    if (error instanceof PaymentMoneyError) throw new LavaWebhookError(400, "Invalid webhook amount");
    throw error;
  }
  const recurring = payload.eventType.startsWith("subscription.");
  const merchantOrderId = typeof payload.clientUtm?.utm_content === "string"
    && payload.clientUtm.utm_content.length <= 128
    ? payload.clientUtm.utm_content
    : null;
  const subscriptionId = recurring
    ? payload.parentContractId ?? payload.contractId
    : payload.status.toLowerCase().includes("subscription")
      ? payload.contractId
      : null;

  return {
    eventKey: `${payload.eventType}:${payload.contractId}`,
    provider: "lava",
    type: eventTypes[payload.eventType],
    externalOrderId: payload.parentContractId ?? payload.contractId,
    merchantOrderId,
    externalPaymentId: payload.contractId,
    externalSubscriptionId: subscriptionId,
    productId: payload.product.id,
    buyerEmail: payload.buyer.email,
    buyerPhone: payload.buyer.phone ?? null,
    amountMinor,
    currency: currency.data,
    occurredAt: new Date(payload.timestamp),
    payload: json as Record<string, unknown>
  };
}
