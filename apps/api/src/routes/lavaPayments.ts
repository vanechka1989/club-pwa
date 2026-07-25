import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db } from "../db/client";
import { paymentProviders } from "../db/schema";
import { logger } from "../logger";
import { LavaWebhookError, parseLavaWebhook } from "../payments/lavaWebhook";
import { processPaymentEvent } from "../payments/paymentEventProcessor";
import { decryptProviderSecret } from "../payments/providerSecrets";

type LavaWebhookFamily = "payment" | "subscription";

function acceptsFamily(family: LavaWebhookFamily, type: string) {
  return family === "payment" ? type.startsWith("payment_") : !type.startsWith("payment_");
}

async function handleWebhook(c: Context, family: LavaWebhookFamily) {
  const provider = await db.query.paymentProviders.findFirst({
    where: eq(paymentProviders.provider, "lava")
  });
  if (!provider?.isEnabled || !provider.webhookSecret) {
    return c.json({ ok: false, error: "Lava webhook is not configured" }, 503);
  }

  try {
    const event = await parseLavaWebhook(c.req.raw, decryptProviderSecret(provider.webhookSecret));
    if (!acceptsFamily(family, event.type)) {
      return c.json({ ok: false, error: "Unexpected Lava webhook event family" }, 400);
    }
    const result = await processPaymentEvent(event, provider.id);
    return c.json({ ok: true, result });
  } catch (error) {
    if (error instanceof LavaWebhookError) {
      return c.json({ ok: false, error: error.message }, error.status);
    }
    const code = error instanceof Error ? error.message : "LAVA_WEBHOOK_PROCESSING_FAILED";
    if (code === "PAYMENT_ORDER_AMOUNT_MISMATCH") {
      logger.warn({ code }, "Lava webhook order mismatch");
      return c.json({ ok: false, error: "Order contents mismatch" }, 400);
    }
    logger.warn({ code }, "Lava webhook processing failed");
    return c.json({ ok: false, error: "Temporary webhook processing failure" }, 503);
  }
}

export const lavaPaymentsRoute = new Hono()
  .post("/webhook/payment", (c) => handleWebhook(c, "payment"))
  .post("/webhook/subscription", (c) => handleWebhook(c, "subscription"));
