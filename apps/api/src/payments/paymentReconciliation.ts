import { and, eq, gte, isNotNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { paymentOrders, paymentProviders, userRecurrentSubscriptions } from "../db/schema";
import { logger } from "../logger";
import { processPaymentEvent } from "./paymentEventProcessor";
import { getPaymentProviderAdapter } from "./providerRegistry";
import { decryptProviderSecret, encryptProviderSecret } from "./providerSecrets";
import { runBoundedReconciliation, type ReconciliationSummary } from "./paymentReconciliationCore";
export { runBoundedReconciliation, type ReconciliationSummary } from "./paymentReconciliationCore";

async function encryptLegacyProviderSecrets() {
  const providers = await db.query.paymentProviders.findMany();
  for (const provider of providers) {
    const updates: Partial<typeof paymentProviders.$inferInsert> = {};
    if (provider.secretKey && !provider.secretKey.startsWith("enc:v1:")) {
      updates.secretKey = encryptProviderSecret(provider.secretKey);
    }
    if (provider.apiKey && !provider.apiKey.startsWith("enc:v1:")) {
      updates.apiKey = encryptProviderSecret(provider.apiKey);
    }
    if (provider.webhookSecret && !provider.webhookSecret.startsWith("enc:v1:")) {
      updates.webhookSecret = encryptProviderSecret(provider.webhookSecret);
    }
    if (Object.keys(updates).length) {
      await db.update(paymentProviders).set({ ...updates, updatedAt: new Date() }).where(eq(paymentProviders.id, provider.id));
    }
  }
}

export async function reconcileLavaPayments(now = new Date()): Promise<ReconciliationSummary> {
  await encryptLegacyProviderSecrets();
  const provider = await db.query.paymentProviders.findFirst({
    where: eq(paymentProviders.provider, "lava")
  });
  if (!provider?.apiKey || !provider.isEnabled) return { checked: 0, corrected: 0, failed: 0 };

  const recentSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const orders = await db.query.paymentOrders.findMany({
    where: and(
      eq(paymentOrders.providerId, provider.id),
      eq(paymentOrders.status, "pending"),
      isNotNull(paymentOrders.externalOrderId),
      gte(paymentOrders.createdAt, recentSince)
    ),
    with: { user: true, product: true },
    limit: 100
  });
  const adapter = getPaymentProviderAdapter("lava");
  if (!adapter.getOrderStatus) return { checked: 0, corrected: 0, failed: 0 };

  const orderSummary = await runBoundedReconciliation(orders, async (order) => {
    const event = await adapter.getOrderStatus!({
      credentials: { apiKey: decryptProviderSecret(provider.apiKey!) },
      externalOrderId: order.externalOrderId!,
      productId: order.productId,
      buyerEmail: order.user.email ?? ""
    });
    if (!event) return "unchanged";
    const result = await processPaymentEvent(event, provider.id);
    return result === "processed" ? "corrected" : "unchanged";
  }, 4);
  const recurrentSubscriptions = adapter.getSubscriptionEvents
    ? await db.query.userRecurrentSubscriptions.findMany({
        where: and(
          eq(userRecurrentSubscriptions.providerId, provider.id),
          isNotNull(userRecurrentSubscriptions.externalSubscriptionId),
          or(
            eq(userRecurrentSubscriptions.status, "active"),
            gte(userRecurrentSubscriptions.updatedAt, recentSince)
          )
        ),
        with: { user: true, product: true },
        limit: 100
      })
    : [];
  const subscriptionSummary = await runBoundedReconciliation(recurrentSubscriptions, async (subscription) => {
    const events = await adapter.getSubscriptionEvents!({
      credentials: { apiKey: decryptProviderSecret(provider.apiKey!) },
      externalSubscriptionId: subscription.externalSubscriptionId!,
      productId: subscription.productId,
      buyerEmail: subscription.user.email ?? ""
    });
    let corrected = false;
    for (const event of events) {
      if (await processPaymentEvent(event, provider.id) === "processed") corrected = true;
    }
    return corrected ? "corrected" : "unchanged";
  }, 4);
  const summary = {
    checked: orderSummary.checked + subscriptionSummary.checked,
    corrected: orderSummary.corrected + subscriptionSummary.corrected,
    failed: orderSummary.failed + subscriptionSummary.failed
  };
  if (summary.failed) {
    logger.warn({ checked: summary.checked, corrected: summary.corrected, failed: summary.failed }, "Lava reconciliation completed with safe failures");
  }
  return summary;
}

export function startPaymentReconciliationJob(intervalMs = 5 * 60 * 1000) {
  const run = () => {
    void reconcileLavaPayments().catch((error) => {
      logger.warn({ code: error instanceof Error ? error.message : "LAVA_RECONCILIATION_FAILED" }, "Lava reconciliation failed");
    });
  };
  run();
  return setInterval(run, intervalMs);
}
