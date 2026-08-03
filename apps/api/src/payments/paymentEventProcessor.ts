import { and, desc, eq, ne, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  paymentOrders,
  individualPaymentOffers,
  paymentWebhookEvents,
  subscriptions,
  userRecurrentSubscriptions,
  users
} from "../db/schema";
import { logger } from "../logger";
import { notifyPaymentReceived } from "./paymentNotification";
import type { NormalizedPaymentEvent } from "./providerAdapter";
import { awardReferralRewardForFirstPayment } from "../referrals/referrals";
import { getCompatibleLegacyRubAmount, getExtendedAccessExpiry, isPaymentAmountValid } from "./paymentEventRules";
import { resolvePaymentOrderSnapshot } from "./paymentOrderSnapshot";
import { extractVerifiedPaymentPhone } from "../admin/personalData";

export type PaymentEventProcessResult = "processed" | "duplicate" | "ignored";

type PaymentSuccessNotification = {
  userId: string;
  productTitle: string;
  currency: "RUB" | "USD" | "EUR";
  amountMinor: number;
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
          eq(paymentOrders.providerOrderId, event.externalOrderId),
          event.merchantOrderId ? eq(paymentOrders.providerOrderId, event.merchantOrderId) : undefined
        )
      ),
      with: { product: true, individualOffer: true, user: true }
    });
    if (!parentOrder) {
      throw new Error("PAYMENT_ORDER_NOT_READY");
    }
    const productSnapshot = resolvePaymentOrderSnapshot(parentOrder);
    if (!isPaymentAmountValid(
      { currency: parentOrder.currency, amountMinor: parentOrder.amountMinor },
      { currency: event.currency, amountMinor: event.amountMinor }
    )) {
      throw new Error("PAYMENT_ORDER_AMOUNT_MISMATCH");
    }

    let order = parentOrder;
    if (event.type === "renewal_succeeded" || event.type === "renewal_failed") {
      const [renewalOrder] = await tx
        .insert(paymentOrders)
        .values({
          userId: parentOrder.userId,
          productId: parentOrder.productId,
          individualOfferId: parentOrder.individualOfferId,
          providerId,
          status: "pending",
          amountRub: getCompatibleLegacyRubAmount(parentOrder),
          currency: parentOrder.currency,
          amountMinor: parentOrder.amountMinor,
          providerOrderId: `${event.provider}-${event.externalPaymentId}`,
          externalOrderId: event.externalPaymentId,
          externalSubscriptionId: event.externalSubscriptionId,
          productTitleSnapshot: parentOrder.productTitleSnapshot,
          productKindSnapshot: parentOrder.productKindSnapshot,
          accessDaysSnapshot: parentOrder.accessDaysSnapshot,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt
        })
        .onConflictDoNothing()
        .returning();
      if (!renewalOrder) return "duplicate";
      order = { ...renewalOrder, product: parentOrder.product, individualOffer: parentOrder.individualOffer, user: parentOrder.user };
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
      if (order.individualOfferId && event.type === "payment_failed") {
        await tx
          .update(individualPaymentOffers)
          .set({ status: "active", updatedAt: event.occurredAt })
          .where(and(eq(individualPaymentOffers.id, order.individualOfferId), eq(individualPaymentOffers.status, "checkout_pending")));
      }
      return "processed";
    }

    const isRenewal = event.type === "renewal_succeeded";
    if (order.individualOfferId && !isRenewal) {
      const [claimedOffer] = await tx
        .update(individualPaymentOffers)
        .set({ status: "paid", paidAt: event.occurredAt, updatedAt: event.occurredAt })
        .where(and(
          eq(individualPaymentOffers.id, order.individualOfferId),
          or(
            eq(individualPaymentOffers.status, "active"),
            eq(individualPaymentOffers.status, "checkout_pending"),
            eq(individualPaymentOffers.status, "expired")
          )
        ))
        .returning({ id: individualPaymentOffers.id });
      if (!claimedOffer) return "duplicate";
      await tx
        .update(paymentOrders)
        .set({ status: "cancelled", updatedAt: event.occurredAt })
        .where(and(
          eq(paymentOrders.individualOfferId, order.individualOfferId),
          ne(paymentOrders.id, order.id),
          eq(paymentOrders.status, "pending")
        ));
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

    const verifiedPhone = event.buyerPhone
      ? extractVerifiedPaymentPhone(event.provider, { buyer: { phone: event.buyerPhone } })
      : null;
    if (verifiedPhone) {
      await tx.update(users).set({
        phone: verifiedPhone.phone,
        phoneSource: verifiedPhone.phoneSource,
        phoneUpdatedAt: event.occurredAt,
        updatedAt: event.occurredAt
      }).where(eq(users.id, order.userId));
    }

    const latestAccess = await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, order.userId),
      orderBy: [desc(subscriptions.expiresAt), desc(subscriptions.createdAt)]
    });
    const expiresAt = getExtendedAccessExpiry(event.occurredAt, latestAccess?.expiresAt ?? null, productSnapshot.accessDays);
    await tx.insert(subscriptions).values({
      userId: order.userId,
      status: "active",
      provider: productSnapshot.kind === "recurrent" ? `${event.provider}_recurrent` : event.provider,
      providerPaymentId: event.externalPaymentId,
      expiresAt,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt
    });

    if (productSnapshot.kind === "recurrent" && event.externalSubscriptionId) {
      const recurrentValues = {
        userId: order.userId,
        productId: parentOrder.productId,
        individualOfferId: parentOrder.individualOfferId,
        providerId,
        status: "active" as const,
        prodamusSubscriptionId: event.provider === "prodamus" ? event.externalSubscriptionId : null,
        externalSubscriptionId: event.externalSubscriptionId,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt
      };
      const conflictSet = {
        status: "active" as const,
        prodamusSubscriptionId: event.provider === "prodamus" ? event.externalSubscriptionId : null,
        externalSubscriptionId: event.externalSubscriptionId,
        cancelledAt: null,
        updatedAt: event.occurredAt
      };
      if (parentOrder.productId) {
        await tx.insert(userRecurrentSubscriptions).values(recurrentValues).onConflictDoUpdate({
          target: [userRecurrentSubscriptions.userId, userRecurrentSubscriptions.productId],
          set: conflictSet
        });
      } else {
        await tx.insert(userRecurrentSubscriptions).values(recurrentValues).onConflictDoUpdate({
          target: [userRecurrentSubscriptions.userId, userRecurrentSubscriptions.individualOfferId],
          set: conflictSet
        });
      }
    }

    notification = {
      userId: order.userId,
      productTitle: productSnapshot.title,
      currency: order.currency,
      amountMinor: order.amountMinor,
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
      currency: notificationValue.currency,
      amountMinor: notificationValue.amountMinor,
      expiresAt: notificationValue.expiresAt
    }).catch((error) => {
      logger.warn({ error, orderId: notificationValue.order.providerOrderId, userId: notificationValue.userId }, "payment notification failed");
    });
  }
  return result;
}
