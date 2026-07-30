import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import {
  individualPaymentOffers,
  paymentOrders,
  paymentProviderCatalogItems,
  userRecurrentSubscriptions,
  users,
  type PaymentProvider
} from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { isOwnerTelegramId } from "../admin/roles";
import { getPaymentProviderAdapter } from "../payments/providerRegistry";
import { decryptProviderSecret, encryptProviderSecret } from "../payments/providerSecrets";
import { resolveLavaCheckoutBuyerEmail } from "../payments/lavaCheckoutBuyer";
import { LavaApiError } from "../payments/lava";
import { isLavaCatalogPriceForProduct } from "../payments/lavaPeriodicity";
import { hashIndividualOfferToken, resolveIndividualOfferAvailability } from "../payments/individualOfferPolicy";
import { getMembership } from "../membership/getMembership";
import { hasBlockingRecurrentSubscription } from "../payments/recurrentCheckoutGuard";

const checkoutCreationLeaseMs = 2 * 60 * 1000;

function providerCredentials(provider: PaymentProvider) {
  return {
    formUrl: provider.formUrl,
    secretKey: provider.secretKey ? decryptProviderSecret(provider.secretKey) : undefined,
    sys: provider.sys,
    apiKey: provider.apiKey ? decryptProviderSecret(provider.apiKey) : undefined,
    webhookSecret: provider.webhookSecret ? decryptProviderSecret(provider.webhookSecret) : undefined
  };
}

function serializeOffer(offer: typeof individualPaymentOffers.$inferSelect) {
  return {
    id: offer.id,
    provider: offer.provider as "prodamus" | "lava",
    kind: offer.kind,
    title: offer.title,
    currency: offer.currency,
    amountMinor: offer.amountMinor,
    accessDays: offer.accessDays,
    status: offer.status as "active" | "checkout_pending" | "paid" | "expired" | "cancelled",
    expiresAt: offer.expiresAt.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    firstOpenedAt: offer.firstOpenedAt?.toISOString() ?? null,
    checkoutStartedAt: offer.checkoutStartedAt?.toISOString() ?? null,
    paidAt: offer.paidAt?.toISOString() ?? null,
    cancelledAt: offer.cancelledAt?.toISOString() ?? null
  };
}

async function findAssignedOffer(token: string, userId: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  return db.query.individualPaymentOffers.findFirst({
    where: and(
      eq(individualPaymentOffers.tokenHash, hashIndividualOfferToken(token)),
      eq(individualPaymentOffers.userId, userId)
    ),
    with: { providerRecord: true, orders: true }
  });
}

function webhookUrl(provider: "prodamus" | "lava") {
  const origin = env.WEB_ORIGIN.replace(/\/$/, "");
  return provider === "lava"
    ? `${origin}/api/payments/lava/webhook/payment`
    : `${origin}/api/payments/prodamus/webhook`;
}

export const individualPaymentOffersRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/:token", async (c) => {
    const offer = await findAssignedOffer(c.req.param("token"), c.get("userId"));
    if (!offer) return c.json({ error: "Предложение не найдено." }, 404);
    const now = new Date();
    const availability = resolveIndividualOfferAvailability({ ...offer, provider: offer.provider as "prodamus" | "lava", status: offer.status as "active" | "checkout_pending" | "paid" | "expired" | "cancelled" }, c.get("userId"), now);
    if (availability === "expired" && offer.status !== "expired") {
      offer.status = "expired";
      await db.update(individualPaymentOffers).set({ status: "expired", updatedAt: now }).where(and(
        eq(individualPaymentOffers.id, offer.id),
        inArray(individualPaymentOffers.status, ["active", "checkout_pending"])
      ));
    }
    if (!offer.firstOpenedAt) {
      offer.firstOpenedAt = now;
      await db.update(individualPaymentOffers).set({ firstOpenedAt: now, updatedAt: now }).where(eq(individualPaymentOffers.id, offer.id));
    }
    return c.json({ offer: serializeOffer(offer) });
  })
  .post("/:token/checkout", async (c) => {
    const userId = c.get("userId");
    const offer = await findAssignedOffer(c.req.param("token"), userId);
    if (!offer) return c.json({ error: "Предложение не найдено." }, 404);
    const now = new Date();
    const availability = resolveIndividualOfferAvailability({ ...offer, provider: offer.provider as "prodamus" | "lava", status: offer.status as "active" | "checkout_pending" | "paid" | "expired" | "cancelled" }, userId, now);
    if (availability !== "available") {
      if (availability === "expired" && offer.status !== "expired") {
        await db.update(individualPaymentOffers).set({ status: "expired", updatedAt: now }).where(and(
          eq(individualPaymentOffers.id, offer.id),
          inArray(individualPaymentOffers.status, ["active", "checkout_pending"])
        ));
      }
      return c.json({ error: availability === "paid" ? "Предложение уже оплачено." : "Предложение больше недоступно." }, 409);
    }
    if (!offer.providerRecord?.isEnabled) return c.json({ error: "Платёжная система временно недоступна." }, 409);
    if (offer.kind === "recurrent") {
      const [subscriptions, membership] = await Promise.all([
        db.query.userRecurrentSubscriptions.findMany({ where: eq(userRecurrentSubscriptions.userId, userId) }),
        getMembership(userId)
      ]);
      if (hasBlockingRecurrentSubscription(subscriptions, {
        isActiveMembership: membership.isActive,
        subscriptionProvider: membership.subscription?.provider ?? null
      })) {
        return c.json({ error: "У вас уже есть активная или восстанавливаемая автоподписка." }, 409);
      }
    }
    const pendingOrder = offer.orders.find((order) => order.status === "pending");
    if (pendingOrder?.checkoutUrl) {
      return c.json({ checkoutUrl: decryptProviderSecret(pendingOrder.checkoutUrl), message: "Открываем ранее созданную платёжную страницу." });
    }
    if (pendingOrder) {
      if (offer.provider === "lava") {
        return c.json({ error: "Lava уже обрабатывает эту платёжную сессию. Не создавайте повторную оплату; результат поступит автоматически." }, 409);
      }
      const staleBefore = new Date(now.getTime() - checkoutCreationLeaseMs);
      if (pendingOrder.updatedAt.getTime() >= staleBefore.getTime()) {
        return c.json({ error: "Платёжная страница создаётся. Повторите через несколько секунд." }, 409);
      }
      const recovered = await db.transaction(async (tx) => {
        const [releasedOrder] = await tx.update(paymentOrders).set({
          status: "failed",
          updatedAt: now
        }).where(and(
          eq(paymentOrders.id, pendingOrder.id),
          eq(paymentOrders.status, "pending"),
          isNull(paymentOrders.checkoutUrl),
          lt(paymentOrders.updatedAt, staleBefore)
        )).returning({ id: paymentOrders.id });
        if (!releasedOrder) return false;
        await tx.update(individualPaymentOffers).set({
          status: "active",
          updatedAt: now
        }).where(and(
          eq(individualPaymentOffers.id, offer.id),
          eq(individualPaymentOffers.status, "checkout_pending")
        ));
        return true;
      });
      return c.json({
        error: recovered
          ? "Предыдущая попытка оплаты восстановлена после сбоя. Нажмите оплатить ещё раз."
          : "Платёжная страница уже создаётся в другой сессии. Повторите через несколько секунд."
      }, 409);
    }
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return c.json({ error: "Пользователь не найден." }, 404);
    const providerCode = offer.provider as "prodamus" | "lava";
    const buyerEmail = providerCode === "lava"
      ? resolveLavaCheckoutBuyerEmail({
          isOwner: await isOwnerTelegramId(user.telegramId),
          userEmail: user.email,
          testBuyerEmail: offer.providerRecord.testBuyerEmail
        })
      : user.email;
    if (providerCode === "lava" && (!buyerEmail || !offer.externalOfferId)) {
      return c.json({ error: !buyerEmail ? "Для оплаты через Lava укажите email в профиле." : "Предложение Lava недоступно." }, 400);
    }
    if (providerCode === "prodamus" && offer.kind === "recurrent" && !offer.externalProductId) {
      return c.json({ error: "У предложения не указан ID подписки Prodamus." }, 400);
    }
    let useCustomAmount = false;
    if (providerCode === "lava") {
      const catalog = await db.query.paymentProviderCatalogItems.findFirst({
        where: and(
          eq(paymentProviderCatalogItems.providerId, offer.providerId),
          eq(paymentProviderCatalogItems.externalOfferId, offer.externalOfferId!)
        ),
        with: { prices: true }
      });
      const price = catalog?.prices.find((entry) =>
        entry.currency === offer.currency && isLavaCatalogPriceForProduct(entry.periodicity, offer.kind, offer.accessDays)
      );
      if (!catalog || catalog.isStale || !catalog.isSelectable || !price || (price.amountMinor !== null && price.amountMinor !== offer.amountMinor)) {
        return c.json({ error: "Цена или доступность товара Lava изменилась. Попросите администратора создать новую ссылку." }, 409);
      }
      useCustomAmount = price.amountMinor === null;
    }
    const providerOrderId = `club-offer-${randomUUID()}`;
    let order: typeof paymentOrders.$inferSelect | null = null;
    let lavaCreateAttempted = false;
    try {
      order = await db.transaction(async (tx) => {
        const [reserved] = await tx.update(individualPaymentOffers).set({
          status: "checkout_pending",
          checkoutStartedAt: now,
          updatedAt: now
        }).where(and(
          eq(individualPaymentOffers.id, offer.id),
          eq(individualPaymentOffers.status, "active")
        )).returning({ id: individualPaymentOffers.id });
        if (!reserved) throw new Error("INDIVIDUAL_OFFER_ALREADY_RESERVED");
        const [saved] = await tx.insert(paymentOrders).values({
          userId,
          productId: null,
          individualOfferId: offer.id,
          providerId: offer.providerId,
          status: "pending",
          currency: offer.currency,
          amountMinor: offer.amountMinor,
          amountRub: offer.currency === "RUB" && offer.amountMinor % 100 === 0 ? offer.amountMinor / 100 : null,
          providerOrderId,
          productTitleSnapshot: offer.title,
          productKindSnapshot: offer.kind,
          accessDaysSnapshot: offer.accessDays,
          createdAt: now,
          updatedAt: now
        }).returning();
        if (!saved) throw new Error("INDIVIDUAL_OFFER_ORDER_NOT_CREATED");
        return saved;
      });
      lavaCreateAttempted = providerCode === "lava";
      const checkout = await getPaymentProviderAdapter(providerCode).createCheckout({
        credentials: providerCredentials(offer.providerRecord),
        orderId: providerOrderId,
        user: { id: user.id, telegramId: user.telegramId, email: buyerEmail },
        product: {
          title: offer.title,
          amountRub: offer.currency === "RUB" && offer.amountMinor % 100 === 0 ? offer.amountMinor / 100 : null,
          currency: offer.currency,
          amountMinor: offer.amountMinor,
          useCustomAmount,
          kind: offer.kind,
          accessDays: offer.accessDays,
          externalProductId: offer.externalProductId,
          externalOfferId: offer.externalOfferId
        },
        returnUrl: `${env.WEB_ORIGIN.replace(/\/$/, "")}/payments/offers/${c.req.param("token")}`,
        notificationUrl: webhookUrl(providerCode),
        expiresAt: offer.expiresAt
      });
      const [savedCheckout] = await db.update(paymentOrders).set({
        checkoutUrl: encryptProviderSecret(checkout.checkoutUrl),
        externalOrderId: checkout.externalOrderId ?? order.externalOrderId,
        updatedAt: new Date()
      }).where(and(
        eq(paymentOrders.id, order.id),
        eq(paymentOrders.status, "pending"),
        isNull(paymentOrders.checkoutUrl)
      )).returning({ id: paymentOrders.id });
      if (!savedCheckout) throw new Error("INDIVIDUAL_OFFER_CHECKOUT_LEASE_LOST");
      return c.json({ checkoutUrl: checkout.checkoutUrl, message: "Платёжная страница готова." });
    } catch (error) {
      logger.warn({ error, offerId: offer.id, providerOrderId }, "individual offer checkout failed");
      const definiteLavaFailure = error instanceof LavaApiError
        && ["LAVA_UNAUTHORIZED", "LAVA_RATE_LIMITED", "LAVA_BUYER_EMAIL_REJECTED"].includes(error.code);
      const ambiguousLavaResult = providerCode === "lava" && lavaCreateAttempted && !definiteLavaFailure;
      let releasedOwnReservation = false;
      if (order && !ambiguousLavaResult) {
        const [releasedOrder] = await db.update(paymentOrders).set({ status: "failed", updatedAt: new Date() }).where(and(
          eq(paymentOrders.id, order.id),
          eq(paymentOrders.status, "pending")
        )).returning({ id: paymentOrders.id });
        releasedOwnReservation = Boolean(releasedOrder);
      }
      if (!ambiguousLavaResult && (!order || releasedOwnReservation)) {
        await db.update(individualPaymentOffers).set({ status: "active", updatedAt: new Date() }).where(and(
          eq(individualPaymentOffers.id, offer.id),
          eq(individualPaymentOffers.status, "checkout_pending")
        ));
      }
      const code = error instanceof Error ? error.message : "";
      return c.json({
        error: code === "INDIVIDUAL_OFFER_ALREADY_RESERVED"
          ? "Оплата уже открыта."
          : ambiguousLavaResult
            ? "Lava приняла запрос, но не подтвердила результат. Повторная оплата заблокирована; статус обновится автоматически."
            : "Не удалось открыть оплату. Попробуйте ещё раз."
      }, code === "INDIVIDUAL_OFFER_ALREADY_RESERVED" ? 409 : 502);
    }
  });
