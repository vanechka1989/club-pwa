import { and, desc, eq, ne, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  paymentOrders,
  paymentWebhookEvents,
  subscriptions,
  userRecurrentSubscriptions,
  users
} from "../db/schema";
import { logger } from "../logger";
import { notifyPaymentReceived } from "./paymentNotification";
import type { NormalizedPaymentEvent } from "./providerAdapter";
import { awardReferralRewardForFirstPayment } from "../referrals/referrals";
import { getExtendedAccessExpiry, isPaymentAmountValid } from "./paymentEventRules";

export type PaymentEventProcessResult = "processed" | "duplicate" | "ignored";

type PaymentSuccessNotification = {
  userId: string;
  productTitle: string;
  amountRub: number;
  expiresAt: Date;
  order: typeof paymentOrders.$inferSelect;
  user: typeof users.$inferSelect;
};

export async function processPaymentEvent(
  event: NormalizedPaymentEvent,
  providerId: string
): Promise<PaymentEventProcessResult> {
  let notification: PaymentSuccessNotification | null = null;

  const result = await db.transaction(async (tx): Promise<PaymentEventProcessResult> => {
    const [claimedEvent] = await tx
      .insert(paymentWebhookEvents)
      .values({
        providerId,
        provider: event.provider,
        eventKey: event.eventKey,
        isValid: true,
        payload: event.payload
      })
      .onConflictDoNothing()
      .returning({ id: paymentWebhookEvents.id });
    if (!claimedEvent) return "duplicate";

    if (event.type === "subscription_cancelled") {
      if (!event.externalSubscriptionId) return "ignored";
      await tx
        .update(userRecurrentSubscriptions)
        .set({ status: "cancelled", cancelledAt: event.occurredAt, updatedAt: new Date() })
        .where(and(
          eq(userRecurrentSubscriptions.providerId, providerId),
          or(
            eq(userRecurrentSubscriptions.externalSubscriptionId, event.externalSubscriptionId),
            eq(userRecurrentSubscriptions.prodamusSubscriptionId, event.externalSubscriptionId)
          )
        ));
      return "processed";
    }

    const parentOrder = await tx.query.paymentOrders.findFirst({
      where: and(
        eq(paymentOrders.providerId, providerId),
        or(
          eq(paymentOrders.externalOrderId, event.externalOrderId),
          eq(paymentOrders.providerOrderId, event.externalOrderId)
        )
      ),
      with: { product: true, user: true }
    });
    if (!parentOrder) {
      throw new Error("PAYMENT_ORDER_NOT_READY");
    }
    if (!isPaymentAmountValid(parentOrder.amountRub ?? 0, event.amountRub, event.currency)) {
      throw new Error("PAYMENT_ORDER_AMOUNT_MISMATCH");
    }

    let order = parentOrder;
    if (event.type === "renewal_succeeded" || event.type === "renewal_failed") {
      const [renewalOrder] = await tx
        .insert(paymentOrders)
        .values({
          userId: parentOrder.userId,
          productId: parentOrder.productId,
          providerId,
          status: "pending",
          amountRub: parentOrder.amountRub,
          currency: parentOrder.currency,
          amountMinor: parentOrder.amountMinor,
          providerOrderId: `${event.provider}-${event.externalPaymentId}`,
          externalOrderId: event.externalPaymentId,
          externalSubscriptionId: event.externalSubscriptionId,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt
        })
        .onConflictDoNothing()
        .returning();
      if (!renewalOrder) return "duplicate";
      order = { ...renewalOrder, product: parentOrder.product, user: parentOrder.user };
    }

    if (event.type === "payment_failed" || event.type === "renewal_failed") {
      await tx
        .update(paymentOrders)
        .set({
          status: "failed",
          providerPaymentId: event.externalPaymentId,
          externalSubscriptionId: event.externalSubscriptionId,
          rawPayload: event.payload,
          updatedAt: event.occurredAt
        })
        .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")));
      return "processed";
    }

    const [claimedOrder] = await tx
      .update(paymentOrders)
      .set({
        status: "paid",
        providerPaymentId: event.externalPaymentId,
        externalOrderId: order.externalOrderId ?? event.externalOrderId,
        externalSubscriptionId: event.externalSubscriptionId,
        paidAt: event.occurredAt,
        rawPayload: event.payload,
        updatedAt: event.occurredAt
      })
      .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")))
      .returning();
    if (!claimedOrder) return "duplicate";

    const latestAccess = await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, order.userId),
      orderBy: [desc(subscriptions.expiresAt), desc(subscriptions.createdAt)]
    });
    const expiresAt = getExtendedAccessExpiry(event.occurredAt, latestAccess?.expiresAt ?? null, parentOrder.product.accessDays);
    await tx.insert(subscriptions).values({
      userId: order.userId,
      status: "active",
      provider: parentOrder.product.kind === "recurrent" ? `${event.provider}_recurrent` : event.provider,
      providerPaymentId: event.externalPaymentId,
      expiresAt,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt
    });

    if (parentOrder.product.kind === "recurrent" && event.externalSubscriptionId) {
      await tx
        .insert(userRecurrentSubscriptions)
        .values({
          userId: order.userId,
          productId: parentOrder.productId,
          providerId,
          status: "active",
          prodamusSubscriptionId: event.provider === "prodamus" ? event.externalSubscriptionId : null,
          externalSubscriptionId: event.externalSubscriptionId,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt
        })
        .onConflictDoUpdate({
          target: [userRecurrentSubscriptions.userId, userRecurrentSubscriptions.productId],
          set: {
            status: "active",
            prodamusSubscriptionId: event.provider === "prodamus" ? event.externalSubscriptionId : null,
            externalSubscriptionId: event.externalSubscriptionId,
            cancelledAt: null,
            updatedAt: event.occurredAt
          }
        });
    }

    notification = {
      userId: order.userId,
      productTitle: parentOrder.product.title,
      amountRub: order.amountRub ?? 0,
      expiresAt,
      order: claimedOrder,
      user: parentOrder.user
    };
    return "processed";
  });

  const notificationValue = notification as PaymentSuccessNotification | null;
  if (notificationValue) {
    await awardReferralRewardForFirstPayment(notificationValue.order, notificationValue.user).catch((error) => {
      logger.warn({ error, orderId: notificationValue.order.providerOrderId, userId: notificationValue.userId }, "referral reward failed");
    });
    await notifyPaymentReceived({
      userId: notificationValue.userId,
      productTitle: notificationValue.productTitle,
      amountRub: notificationValue.amountRub,
      expiresAt: notificationValue.expiresAt
    }).catch((error) => {
      logger.warn({ error, orderId: notificationValue.order.providerOrderId, userId: notificationValue.userId }, "payment notification failed");
    });
  }
  return result;
}
