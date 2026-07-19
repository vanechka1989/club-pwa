import { and, asc, desc, eq, gt, isNull, ne, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaymentOrderLog } from "@club/shared";
import { recordAdminAction } from "../admin/actionLog";
import { getAdminAccessProfile, getUserRole } from "../admin/roles";
import { db } from "../db/client";
import {
  paymentOrders,
  paymentProducts,
  paymentProviders,
  paymentWebhookEvents,
  subscriptions,
  userRecurrentSubscriptions,
  users,
  type PaymentProduct,
  type PaymentProvider
} from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { canManagePaymentSettings, canReadPaymentSettings } from "../payments/adminAccess";
import { cleanupExpiredPendingPaymentOrders } from "../payments/orderCleanupJob";
import { notifyPaymentReceived } from "../payments/paymentNotification";
import { getMembership } from "../membership/getMembership";
import {
  buildProdamusPaymentUrl,
  getProdamusNotificationOrderId,
  getProdamusSubscriptionIdentity,
  normalizeProdamusFormUrl,
  setProdamusSubscriptionActivity,
  verifyProdamusSignature
} from "../payments/prodamus";
import {
  classifyProdamusWebhookPaymentStatus,
  decideProdamusWebhookAction,
  getProdamusWebhookSuccessResponse,
  parseProdamusWebhookRequest,
  ProdamusWebhookRequestError,
  validateProdamusWebhookOrder
} from "../payments/prodamusWebhook";
import { hasBlockingRecurrentSubscription } from "../payments/recurrentCheckoutGuard";
import { awardReferralRewardForFirstPayment } from "../referrals/referrals";
import { buildPaymentDiagnostic, summarizePaymentDiagnostics } from "../payments/paymentDiagnostics";

const productArchiveTtlMs = 7 * 24 * 60 * 60 * 1000;

async function getPaymentAdminAccess(c: Context<{ Variables: AuthVariables }>) {
  const telegramId = c.get("telegramUser").id;
  const [role, profile] = await Promise.all([getUserRole(telegramId), getAdminAccessProfile(telegramId)]);
  return { role, permissions: profile.permissions };
}

const providerPayloadSchema = z.object({
  formUrl: z.string().trim().min(1),
  secretKey: z.string().trim().min(8).optional(),
  sys: z.string().trim().max(96).default(""),
  isEnabled: z.boolean().optional()
});

const productPayloadSchema = z.object({
  kind: z.enum(["one_time", "recurrent"]),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  badgeLabel: z.string().trim().max(32).nullable().optional(),
  amountRub: z.number().int().positive().max(10_000_000),
  accessDays: z.number().int().positive().max(3650),
  prodamusSubscriptionId: z.string().trim().max(64).nullable().optional(),
  isPublished: z.boolean().optional()
});

const productStatusPayloadSchema = z.object({
  isPublished: z.boolean()
});

const checkoutPayloadSchema = z.object({
  productId: z.string().uuid()
});

function activeProductWhere() {
  return or(isNull(paymentProducts.archivedUntil), gt(paymentProducts.archivedUntil, new Date()));
}

function webhookUrl() {
  return `${env.WEB_ORIGIN.replace(/\/$/, "")}/api/payments/prodamus/webhook`;
}

function mapProvider(provider: PaymentProvider) {
  return {
    id: provider.id,
    provider: "prodamus" as const,
    title: provider.title,
    formUrl: provider.formUrl,
    sys: provider.sys,
    isEnabled: provider.isEnabled,
    secretConfigured: Boolean(provider.secretKey),
    webhookUrl: webhookUrl()
  };
}

function mapProduct(product: PaymentProduct) {
  return {
    id: product.id,
    providerId: product.providerId,
    kind: product.kind,
    title: product.title,
    description: product.description,
    badgeLabel: product.badgeLabel,
    amountRub: product.amountRub,
    accessDays: product.accessDays,
    prodamusSubscriptionId: product.prodamusSubscriptionId,
    isPublished: product.isPublished,
    archivedUntil: product.archivedUntil?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}

async function getProdamusProvider() {
  return db.query.paymentProviders.findFirst({
    where: eq(paymentProviders.provider, "prodamus")
  });
}

function getWebhookOrderId(payload: Record<string, unknown>) {
  return getProdamusNotificationOrderId(payload);
}

function getWebhookPaymentId(payload: Record<string, unknown>) {
  const value = payload.payment_id ?? payload.paymentId ?? payload.invoice_id ?? payload.order_id;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function mapPaymentOrderLog(
  order: typeof paymentOrders.$inferSelect & {
    user: typeof users.$inferSelect;
    product: PaymentProduct;
  },
  webhook: typeof paymentWebhookEvents.$inferSelect | null
): PaymentOrderLog {
  const diagnostic = buildPaymentDiagnostic({
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    webhook: webhook ? { isValid: webhook.isValid, createdAt: webhook.createdAt } : null
  });
  return {
    id: order.id,
    status: order.status,
    amountRub: order.amountRub,
    providerOrderId: order.providerOrderId,
    providerPaymentId: order.providerPaymentId,
    productTitle: order.product.title,
    productKind: order.product.kind,
    customer: {
      id: order.user.id,
      telegramId: order.user.telegramId,
      firstName: order.user.firstName,
      username: order.user.username,
      displayName: order.user.displayName,
      photoUrl: order.user.photoUrl,
      avatarPositionX: order.user.avatarPositionX ?? 50,
      avatarPositionY: order.user.avatarPositionY ?? 50,
      avatarScale: (order.user.avatarScale ?? 100) / 100
    },
    webhook: webhook
      ? {
          isValid: webhook.isValid,
          createdAt: webhook.createdAt.toISOString()
        }
      : null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    diagnostic
  };
}

async function getPaymentOrderLogs(userId?: string, limit = 50) {
  await cleanupExpiredPendingPaymentOrders();

  const orders = await db.query.paymentOrders.findMany({
    where: userId ? eq(paymentOrders.userId, userId) : undefined,
    with: {
      user: true,
      product: true
    },
    orderBy: [desc(paymentOrders.createdAt)],
    limit
  });
  const webhookEvents = await db.query.paymentWebhookEvents.findMany({
    orderBy: [desc(paymentWebhookEvents.createdAt)],
    limit: Math.max(200, limit * 4)
  });
  const webhookByOrderId = new Map<string, typeof paymentWebhookEvents.$inferSelect>();
  for (const event of webhookEvents) {
    const orderId = getWebhookOrderId(event.payload);
    if (orderId && !webhookByOrderId.has(orderId)) {
      webhookByOrderId.set(orderId, event);
    }
  }

  return orders.map((order) => mapPaymentOrderLog(order, webhookByOrderId.get(order.providerOrderId) ?? null));
}

async function grantPaidAccess(
  order: typeof paymentOrders.$inferSelect,
  product: PaymentProduct,
  user: typeof users.$inferSelect,
  payload: Record<string, unknown>
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + product.accessDays * 24 * 60 * 60 * 1000);
  const applied = await db.transaction(async (tx) => {
    const [claimedOrder] = await tx
      .update(paymentOrders)
      .set({
        status: "paid",
        providerPaymentId: getWebhookPaymentId(payload),
        paidAt: now,
        rawPayload: payload,
        updatedAt: now
      })
      .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")))
      .returning({ id: paymentOrders.id });
    if (!claimedOrder) return false;

    await tx.insert(subscriptions).values({
      userId: order.userId,
      status: "active",
      provider: product.kind === "recurrent" ? "prodamus_recurrent" : "prodamus",
      providerPaymentId: order.providerOrderId,
      expiresAt,
      createdAt: now,
      updatedAt: now
    });

    if (product.kind === "recurrent" && product.prodamusSubscriptionId) {
      await tx
        .insert(userRecurrentSubscriptions)
        .values({
          userId: order.userId,
          productId: product.id,
          providerId: order.providerId,
          status: "active",
          prodamusSubscriptionId: product.prodamusSubscriptionId,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [userRecurrentSubscriptions.userId, userRecurrentSubscriptions.productId],
          set: {
            status: "active",
            cancelledAt: null,
            updatedAt: now
          }
        });
    }

    return true;
  });
  if (!applied) return false;

  await awardReferralRewardForFirstPayment(order, user).catch((error) => {
    logger.warn({ error, orderId: order.providerOrderId, userId: user.id }, "referral reward failed");
  });

  await notifyPaymentReceived({
    userId: user.id,
    productTitle: product.title,
    amountRub: order.amountRub,
    expiresAt
  }).catch((error) => {
    logger.warn({ error, orderId: order.providerOrderId, userId: user.id }, "payment notification failed");
  });
  return true;
}

export const paymentsRoute = new Hono<{ Variables: AuthVariables }>()
  .post("/prodamus/webhook", async (c) => {
    let payload: Record<string, unknown>;
    try {
      payload = await parseProdamusWebhookRequest(c.req.raw);
    } catch (error) {
      if (error instanceof ProdamusWebhookRequestError) {
        return c.json({ ok: false, error: error.message }, error.status);
      }
      return c.json({ ok: false, error: "Invalid webhook payload" }, 400);
    }
    const provider = await getProdamusProvider();
    const signature = c.req.header("Sign") ?? c.req.header("sign") ?? c.req.header("Signature") ?? c.req.header("signature");
    const orderId = getWebhookOrderId(payload);
    const isValid = provider ? verifyProdamusSignature(payload, provider.secretKey, signature) : false;

    const initialAction = decideProdamusWebhookAction({
      providerConfigured: Boolean(provider),
      isValidSignature: isValid,
      orderId,
      orderFound: false
    });
    if (initialAction.action === "reject" || !orderId) {
      return c.json({ ok: false }, 400);
    }

    const order = await db.query.paymentOrders.findFirst({
      where: eq(paymentOrders.providerOrderId, orderId)
    });
    const webhookAction = decideProdamusWebhookAction({
      providerConfigured: Boolean(provider),
      isValidSignature: isValid,
      orderId,
      orderFound: Boolean(order)
    });
    if (webhookAction.action === "ignore") {
      return c.text(getProdamusWebhookSuccessResponse());
    }
    if (!order) {
      return c.json({ ok: false }, 404);
    }
    if (order.status === "paid") {
      return c.text(getProdamusWebhookSuccessResponse());
    }

    const [product, user] = await Promise.all([
      db.query.paymentProducts.findFirst({
        where: eq(paymentProducts.id, order.productId)
      }),
      db.query.users.findFirst({
        where: eq(users.id, order.userId)
      })
    ]);
    if (!product) {
      return c.json({ ok: false }, 404);
    }
    if (!user) {
      return c.json({ ok: false }, 404);
    }

    if (!validateProdamusWebhookOrder(payload, { amountRub: order.amountRub, productTitle: product.title })) {
      logger.warn({ orderId }, "prodamus webhook order contents mismatch");
      return c.json({ ok: false, error: "Order contents mismatch" }, 400);
    }

    const eventKey = getWebhookPaymentId(payload) ?? orderId;
    await db
      .insert(paymentWebhookEvents)
      .values({
        providerId: provider?.id ?? null,
        provider: "prodamus",
        eventKey,
        isValid: true,
        payload
      })
      .onConflictDoUpdate({
        target: [paymentWebhookEvents.provider, paymentWebhookEvents.eventKey],
        set: {
          providerId: provider?.id ?? null,
          isValid: true,
          payload
        }
      });

    const paymentStatus = classifyProdamusWebhookPaymentStatus(payload);
    if (paymentStatus === "paid") {
      await grantPaidAccess(order, product, user, payload);
    } else if (paymentStatus === "failed") {
      await db
        .update(paymentOrders)
        .set({ status: "failed", rawPayload: payload, updatedAt: new Date() })
        .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")));
    }

    await cleanupExpiredPendingPaymentOrders();

    return c.text(getProdamusWebhookSuccessResponse());
  })
  .use("*", telegramAuth)
  .get("/plans", async (c) => {
    await cleanupExpiredPendingPaymentOrders();

    const userId = c.get("userId");
    const [provider, products, recurrentSubscriptions] = await Promise.all([
      getProdamusProvider(),
      db.query.paymentProducts.findMany({
        where: and(eq(paymentProducts.isPublished, true), activeProductWhere()),
        orderBy: [asc(paymentProducts.sortOrder), asc(paymentProducts.createdAt)]
      }),
      db.query.userRecurrentSubscriptions.findMany({
        where: eq(userRecurrentSubscriptions.userId, userId),
        with: { product: true },
        orderBy: [asc(userRecurrentSubscriptions.createdAt)]
      })
    ]);

    return c.json({
      plans: products.map((product) => ({
        id: product.id,
        title: product.title,
        priceLabel: `${product.amountRub.toLocaleString("ru-RU")} ₽`,
        periodLabel: product.kind === "recurrent" ? `каждые ${product.accessDays} дн.` : `${product.accessDays} дн.`,
        description: product.description ?? "Доступ к клубу и материалам."
      })),
      provider: provider ? mapProvider(provider) : null,
      products: products.map(mapProduct),
      recurrentSubscriptions: recurrentSubscriptions.map((subscription) => ({
        id: subscription.id,
        productId: subscription.productId,
        title: subscription.product?.title ?? "Подписка",
        status: subscription.status,
        cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
        createdAt: subscription.createdAt.toISOString()
      }))
    });
  })
  .get("/orders", async (c) => {
    const orders = await getPaymentOrderLogs(c.get("userId"), 50);
    return c.json({ orders, summary: summarizePaymentDiagnostics(orders.flatMap((order) => order.diagnostic ? [order.diagnostic] : [])) });
  })
  .post("/checkout", async (c) => {
    await cleanupExpiredPendingPaymentOrders();

    const body = checkoutPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid checkout payload" }, 400);
    }

    const userId = c.get("userId");
    const [provider, product, user, recurrentSubscriptions, membership] = await Promise.all([
      getProdamusProvider(),
      db.query.paymentProducts.findFirst({
        where: and(eq(paymentProducts.id, body.data.productId), eq(paymentProducts.isPublished, true), activeProductWhere())
      }),
      db.query.users.findFirst({
        where: eq(users.id, userId)
      }),
      db.query.userRecurrentSubscriptions.findMany({
        where: eq(userRecurrentSubscriptions.userId, userId)
      }),
      getMembership(userId)
    ]);

    if (!provider || !provider.isEnabled) {
      return c.json({ checkoutUrl: null, message: "Платежная система пока не подключена." }, 400);
    }
    if (!product) {
      return c.json({ checkoutUrl: null, message: "Тариф недоступен." }, 404);
    }
    if (product.kind === "recurrent" && !product.prodamusSubscriptionId) {
      return c.json({ checkoutUrl: null, message: "У рекуррентного тарифа не указан ID подписки Prodamus." }, 400);
    }
    if (!user) {
      return c.json({ checkoutUrl: null, message: "Пользователь не найден." }, 404);
    }
    if (
      hasBlockingRecurrentSubscription(recurrentSubscriptions, {
        isActiveMembership: membership.isActive,
        subscriptionProvider: membership.subscription?.provider ?? null
      })
    ) {
      return c.json(
        {
          checkoutUrl: null,
          message: "У вас есть активная или восстанавливаемая автоподписка. Управляйте подпиской в разделе Оплата."
        },
        409
      );
    }

    const now = new Date();
    const orderId = `club-${randomUUID()}`;
    const [order] = await db
      .insert(paymentOrders)
      .values({
        userId: user.id,
        productId: product.id,
        providerId: provider.id,
        status: "pending",
        amountRub: product.amountRub,
        providerOrderId: orderId,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!order) {
      return c.json({ checkoutUrl: null, message: "Не удалось создать заказ." }, 500);
    }

    const checkoutUrl = buildProdamusPaymentUrl({
      formUrl: provider.formUrl,
      secretKey: provider.secretKey,
      sys: provider.sys || user.telegramId,
      orderId: order.providerOrderId,
      userTelegramId: user.telegramId,
      product: {
        title: product.title,
        amountRub: product.amountRub,
        kind: product.kind,
        accessDays: product.accessDays,
        prodamusSubscriptionId: product.prodamusSubscriptionId
      },
      returnUrl: `${env.WEB_ORIGIN.replace(/\/$/, "")}/`,
      notificationUrl: webhookUrl()
    });

    return c.json({ checkoutUrl, message: "Откройте платежную страницу Prodamus." });
  })
  .post("/recurrent-subscriptions/:id/cancel", async (c) => {
    const subscription = await db.query.userRecurrentSubscriptions.findFirst({
      where: and(eq(userRecurrentSubscriptions.id, c.req.param("id")), eq(userRecurrentSubscriptions.userId, c.get("userId"))),
      with: {
        product: true,
        provider: true,
        user: true
      }
    });
    if (!subscription) {
      return c.json({ error: "Subscription not found" }, 404);
    }
    if (subscription.status !== "active") {
      return c.json({ ok: true });
    }
    if (subscription.product.kind !== "recurrent" || subscription.provider.provider !== "prodamus") {
      return c.json({ error: "Cancel is available only for recurrent Prodamus subscriptions" }, 400);
    }

    const latestPaidOrder = await db.query.paymentOrders.findFirst({
      where: and(
        eq(paymentOrders.userId, subscription.userId),
        eq(paymentOrders.productId, subscription.productId),
        eq(paymentOrders.providerId, subscription.providerId),
        eq(paymentOrders.status, "paid")
      ),
      orderBy: [desc(paymentOrders.paidAt), desc(paymentOrders.updatedAt)]
    });
    const prodamusIdentity = getProdamusSubscriptionIdentity(
      latestPaidOrder?.rawPayload && typeof latestPaidOrder.rawPayload === "object"
        ? (latestPaidOrder.rawPayload as Record<string, unknown>)
        : null,
      subscription.user.telegramId
    );

    try {
      await setProdamusSubscriptionActivity({
        formUrl: subscription.provider.formUrl,
        secretKey: subscription.provider.secretKey,
        subscriptionId: subscription.prodamusSubscriptionId,
        profileId: prodamusIdentity.profileId,
        telegramId: prodamusIdentity.telegramId,
        customerEmail: prodamusIdentity.customerEmail,
        customerPhone: prodamusIdentity.customerPhone,
        activeManager: false
      });
    } catch (error) {
      logger.warn(
        {
          error,
          subscriptionId: subscription.id,
          prodamusSubscriptionId: subscription.prodamusSubscriptionId,
          identityType: prodamusIdentity.profileId
            ? "profile"
            : prodamusIdentity.customerEmail
              ? "customer_email"
              : prodamusIdentity.customerPhone
                ? "customer_phone"
                : "tg_user_id"
        },
        "prodamus subscription cancellation failed"
      );
      return c.json({ error: "Не удалось отменить подписку в Prodamus." }, 502);
    }

    await db
      .update(userRecurrentSubscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(userRecurrentSubscriptions.id, subscription.id));

    return c.json({ ok: true });
  })
  .post("/recurrent-subscriptions/:id/restore", async (c) => {
    const subscription = await db.query.userRecurrentSubscriptions.findFirst({
      where: and(eq(userRecurrentSubscriptions.id, c.req.param("id")), eq(userRecurrentSubscriptions.userId, c.get("userId"))),
      with: {
        product: true,
        provider: true,
        user: true
      }
    });
    if (!subscription) {
      return c.json({ error: "Subscription not found" }, 404);
    }
    if (subscription.status === "active") {
      return c.json({ ok: true });
    }
    if (subscription.product.kind !== "recurrent" || subscription.provider.provider !== "prodamus") {
      return c.json({ error: "Restore is available only for recurrent Prodamus subscriptions" }, 400);
    }

    const membership = await getMembership(subscription.userId);
    if (!membership.isActive || membership.subscription?.provider !== "prodamus_recurrent") {
      return c.json({ error: "Восстановить подписку можно только пока доступ ещё активен." }, 409);
    }

    const latestPaidOrder = await db.query.paymentOrders.findFirst({
      where: and(
        eq(paymentOrders.userId, subscription.userId),
        eq(paymentOrders.productId, subscription.productId),
        eq(paymentOrders.providerId, subscription.providerId),
        eq(paymentOrders.status, "paid")
      ),
      orderBy: [desc(paymentOrders.paidAt), desc(paymentOrders.updatedAt)]
    });
    const prodamusIdentity = getProdamusSubscriptionIdentity(
      latestPaidOrder?.rawPayload && typeof latestPaidOrder.rawPayload === "object"
        ? (latestPaidOrder.rawPayload as Record<string, unknown>)
        : null,
      subscription.user.telegramId
    );

    try {
      await setProdamusSubscriptionActivity({
        formUrl: subscription.provider.formUrl,
        secretKey: subscription.provider.secretKey,
        subscriptionId: subscription.prodamusSubscriptionId,
        profileId: prodamusIdentity.profileId,
        telegramId: prodamusIdentity.telegramId,
        customerEmail: prodamusIdentity.customerEmail,
        customerPhone: prodamusIdentity.customerPhone,
        activeManager: true
      });
    } catch (error) {
      logger.warn(
        {
          error,
          subscriptionId: subscription.id,
          prodamusSubscriptionId: subscription.prodamusSubscriptionId,
          identityType: prodamusIdentity.profileId
            ? "profile"
            : prodamusIdentity.customerEmail
              ? "customer_email"
              : prodamusIdentity.customerPhone
                ? "customer_phone"
                : "tg_user_id"
        },
        "prodamus subscription restore failed"
      );
      return c.json({ error: "Не удалось восстановить подписку в Prodamus." }, 502);
    }

    await db
      .update(userRecurrentSubscriptions)
      .set({ status: "active", cancelledAt: null, updatedAt: new Date() })
      .where(eq(userRecurrentSubscriptions.id, subscription.id));

    return c.json({ ok: true });
  })
  .get("/admin/provider", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canReadPaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const provider = await getProdamusProvider();
    return c.json({ provider: provider ? mapProvider(provider) : null, webhookUrl: webhookUrl() });
  })
  .get("/admin/orders", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canReadPaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const orders = await getPaymentOrderLogs(undefined, 100);
    return c.json({ orders, summary: summarizePaymentDiagnostics(orders.flatMap((order) => order.diagnostic ? [order.diagnostic] : [])) });
  })
  .post("/admin/provider/prodamus", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = providerPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid provider payload" }, 400);
    }

    const now = new Date();
    const existing = await getProdamusProvider();
    if (!existing && !body.data.secretKey) {
      return c.json({ error: "Для подключения Prodamus нужен секретный ключ." }, 400);
    }

    const values = {
      provider: "prodamus",
      title: "Prodamus",
      formUrl: normalizeProdamusFormUrl(body.data.formUrl),
      secretKey: body.data.secretKey ?? existing?.secretKey ?? "",
      sys: body.data.sys,
      isEnabled: body.data.isEnabled ?? true,
      createdByUserId: c.get("userId"),
      updatedAt: now
    };

    const [provider] = existing
      ? await db
          .update(paymentProviders)
          .set(values)
          .where(eq(paymentProviders.id, existing.id))
          .returning()
      : await db
          .insert(paymentProviders)
          .values({ ...values, createdAt: now })
          .returning();

    if (!provider) {
      return c.json({ error: "Unable to save provider" }, 500);
    }

    await recordAdminAction(c, {
      action: existing ? "payment.provider.updated" : "payment.provider.created",
      entityType: "payment_provider",
      entityId: provider.id,
      summary: existing ? "Обновил платежного провайдера Prodamus" : "Подключил платежного провайдера Prodamus",
      metadata: {
        formUrl: provider.formUrl,
        sys: provider.sys,
        isEnabled: provider.isEnabled,
        secretKey: body.data.secretKey ? "[changed]" : "[unchanged]"
      }
    });

    return c.json({ ok: true, provider: mapProvider(provider) });
  })
  .get("/admin/products", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canReadPaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const products = await db.query.paymentProducts.findMany({
      where: activeProductWhere(),
      orderBy: [asc(paymentProducts.sortOrder), asc(paymentProducts.createdAt)]
    });

    return c.json({ products: products.map(mapProduct) });
  })
  .post("/admin/products", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const provider = await getProdamusProvider();
    if (!provider) {
      return c.json({ error: "Сначала подключите Prodamus." }, 400);
    }

    const body = productPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid product payload" }, 400);
    }
    if (body.data.kind === "recurrent" && !body.data.prodamusSubscriptionId) {
      return c.json({ error: "Для рекуррентного тарифа нужен ID подписки Prodamus." }, 400);
    }

    const now = new Date();
    const [product] = await db
      .insert(paymentProducts)
      .values({
        providerId: provider.id,
        kind: body.data.kind,
        title: body.data.title,
        description: body.data.description ?? null,
        badgeLabel: body.data.badgeLabel || null,
        amountRub: body.data.amountRub,
        accessDays: body.data.accessDays,
        prodamusSubscriptionId: body.data.prodamusSubscriptionId ?? null,
        isPublished: body.data.isPublished ?? false,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!product) {
      return c.json({ error: "Unable to create product" }, 500);
    }

    await recordAdminAction(c, {
      action: "payment.product.created",
      entityType: "payment_product",
      entityId: product.id,
      summary: `Создал тариф "${product.title}"`,
      metadata: {
        title: product.title,
        kind: product.kind,
        amountRub: product.amountRub,
        accessDays: product.accessDays,
        isPublished: product.isPublished
      }
    });

    return c.json({ ok: true, product: mapProduct(product) });
  })
  .post("/admin/products/:id", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = productPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid product payload" }, 400);
    }
    if (body.data.kind === "recurrent" && !body.data.prodamusSubscriptionId) {
      return c.json({ error: "Для рекуррентного тарифа нужен ID подписки Prodamus." }, 400);
    }

    const [product] = await db
      .update(paymentProducts)
      .set({
        kind: body.data.kind,
        title: body.data.title,
        description: body.data.description ?? null,
        badgeLabel: body.data.badgeLabel || null,
        amountRub: body.data.amountRub,
        accessDays: body.data.accessDays,
        prodamusSubscriptionId: body.data.prodamusSubscriptionId ?? null,
        isPublished: body.data.isPublished ?? false,
        updatedAt: new Date()
      })
      .where(and(eq(paymentProducts.id, c.req.param("id")), activeProductWhere()))
      .returning();

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    await recordAdminAction(c, {
      action: "payment.product.updated",
      entityType: "payment_product",
      entityId: product.id,
      summary: `Обновил тариф "${product.title}"`,
      metadata: {
        title: product.title,
        kind: product.kind,
        amountRub: product.amountRub,
        accessDays: product.accessDays,
        isPublished: product.isPublished
      }
    });

    return c.json({ ok: true, product: mapProduct(product) });
  })
  .post("/admin/products/:id/status", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = productStatusPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid status payload" }, 400);
    }

    const [product] = await db
      .update(paymentProducts)
      .set({ isPublished: body.data.isPublished, updatedAt: new Date() })
      .where(and(eq(paymentProducts.id, c.req.param("id")), activeProductWhere()))
      .returning();

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    await recordAdminAction(c, {
      action: "payment.product.status_updated",
      entityType: "payment_product",
      entityId: product.id,
      summary: body.data.isPublished ? `Опубликовал тариф "${product.title}"` : `Скрыл тариф "${product.title}"`,
      metadata: {
        isPublished: product.isPublished
      }
    });

    return c.json({ ok: true, product: mapProduct(product) });
  })
  .delete("/admin/products/:id", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [product] = await db
      .update(paymentProducts)
      .set({
        isPublished: false,
        archivedUntil: new Date(Date.now() + productArchiveTtlMs),
        updatedAt: new Date()
      })
      .where(and(eq(paymentProducts.id, c.req.param("id")), activeProductWhere()))
      .returning();

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    await recordAdminAction(c, {
      action: "payment.product.deleted",
      entityType: "payment_product",
      entityId: product.id,
      summary: `Удалил тариф "${product.title}"`,
      metadata: {
        title: product.title,
        archiveTtlDays: 7
      }
    });

    return c.json({ ok: true });
  });
