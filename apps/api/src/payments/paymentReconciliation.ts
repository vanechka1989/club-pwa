import { and, eq, gte, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import { individualPaymentOffers, paymentOrders, paymentProviders, userRecurrentSubscriptions } from "../db/schema";
import { logger } from "../logger";
import { processPaymentEvent } from "./paymentEventProcessor";
import { getPaymentProviderAdapter } from "./providerRegistry";
import { decryptProviderSecret, encryptProviderSecret } from "./providerSecrets";
import { reconcilePendingLavaOrders, runBoundedReconciliation, type ReconciliationSummary } from "./paymentReconciliationCore";
export { reconcilePendingLavaOrders, runBoundedReconciliation, type ReconciliationSummary } from "./paymentReconciliationCore";

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

  const ambiguousBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const unresolvedOrders = adapter.findExternalOrderId
    ? await db.query.paymentOrders.findMany({
        where: and(
          eq(paymentOrders.providerId, provider.id),
          eq(paymentOrders.status, "pending"),
          isNull(paymentOrders.externalOrderId),
          isNotNull(paymentOrders.individualOfferId),
          lt(paymentOrders.createdAt, ambiguousBefore),
          gte(paymentOrders.createdAt, recentSince)
        ),
        with: { individualOffer: true, user: true },
        limit: 100
      })
    : [];
  const unresolvedSummary = await runBoundedReconciliation(unresolvedOrders, async (order) => {
    const externalOrderId = await adapter.findExternalOrderId!({
      credentials: { apiKey: decryptProviderSecret(provider.apiKey!) },
      merchantOrderId: order.providerOrderId,
      createdAt: order.createdAt,
      ...(order.user.email ? { buyerEmail: order.user.email } : {})
    });
    if (externalOrderId) {
      const [linked] = await db.update(paymentOrders).set({ externalOrderId, updatedAt: now }).where(and(
        eq(paymentOrders.id, order.id),
        eq(paymentOrders.status, "pending"),
        isNull(paymentOrders.externalOrderId)
      )).returning({ id: paymentOrders.id });
      if (!linked) return "unchanged";
      const event = await adapter.getOrderStatus!({
        credentials: { apiKey: decryptProviderSecret(provider.apiKey!) },
        externalOrderId,
        productId: order.individualOfferId!,
        buyerEmail: "",
        currency: order.currency,
        amountMinor: order.amountMinor
      });
      if (event) await processPaymentEvent(event, provider.id);
      return "corrected";
    }
    const previousMissingAt = order.rawPayload
      && typeof order.rawPayload === "object"
      && "invoiceLookupMissingAt" in order.rawPayload
      && typeof order.rawPayload.invoiceLookupMissingAt === "string"
      ? new Date(order.rawPayload.invoiceLookupMissingAt)
      : null;
    if (!previousMissingAt || !Number.isFinite(previousMissingAt.getTime()) || now.getTime() - previousMissingAt.getTime() < 10 * 60 * 1000) {
      await db.update(paymentOrders).set({
        rawPayload: { invoiceLookupMissingAt: now.toISOString() },
        updatedAt: now
      }).where(and(
        eq(paymentOrders.id, order.id),
        eq(paymentOrders.status, "pending"),
        isNull(paymentOrders.externalOrderId)
      ));
      return "unchanged";
    }
    return db.transaction(async (tx) => {
      const [released] = await tx.update(paymentOrders).set({ status: "failed", updatedAt: now }).where(and(
        eq(paymentOrders.id, order.id),
        eq(paymentOrders.status, "pending"),
        isNull(paymentOrders.externalOrderId)
      )).returning({ id: paymentOrders.id });
      if (!released || !order.individualOffer) return "unchanged";
      await tx.update(individualPaymentOffers).set({
        status: order.individualOffer.expiresAt.getTime() <= now.getTime() ? "expired" : "active",
        updatedAt: now
      }).where(and(
        eq(individualPaymentOffers.id, order.individualOffer.id),
        eq(individualPaymentOffers.status, "checkout_pending")
      ));
      return "corrected";
    });
  }, 4);

  const orderSummary = await reconcilePendingLavaOrders({
    providerId: provider.id,
    apiKey: decryptProviderSecret(provider.apiKey!),
    orders: orders.map((order) => ({
      externalOrderId: order.externalOrderId!,
      productId: order.productId ?? order.individualOfferId!,
      buyerEmail: order.user.email ?? "",
      currency: order.currency,
      amountMinor: order.amountMinor
    })),
    getOrderStatus: (input) => adapter.getOrderStatus!(input),
    processEvent: processPaymentEvent
  });
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
        with: { user: true, product: true, individualOffer: true },
        limit: 100
      })
    : [];
  const subscriptionSummary = await runBoundedReconciliation(recurrentSubscriptions, async (subscription) => {
    const events = await adapter.getSubscriptionEvents!({
      credentials: { apiKey: decryptProviderSecret(provider.apiKey!) },
      externalSubscriptionId: subscription.externalSubscriptionId!,
      productId: subscription.productId ?? subscription.individualOfferId!,
      buyerEmail: subscription.user.email ?? ""
    });
    let corrected = false;
    for (const event of events) {
      if (await processPaymentEvent(event, provider.id) === "processed") corrected = true;
    }
    return corrected ? "corrected" : "unchanged";
  }, 4);
  const summary = {
    checked: unresolvedSummary.checked + orderSummary.checked + subscriptionSummary.checked,
    corrected: unresolvedSummary.corrected + orderSummary.corrected + subscriptionSummary.corrected,
    failed: unresolvedSummary.failed + orderSummary.failed + subscriptionSummary.failed
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
