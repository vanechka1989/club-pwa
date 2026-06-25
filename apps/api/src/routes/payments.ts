import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserRole } from "../admin/roles";
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
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { canManagePaymentSettings, canReadPaymentSettings } from "../payments/adminAccess";
import {
  buildProdamusPaymentUrl,
  normalizeProdamusFormUrl,
  setProdamusSubscriptionActivity,
  verifyProdamusSignature
} from "../payments/prodamus";

const productArchiveTtlMs = 7 * 24 * 60 * 60 * 1000;

const providerPayloadSchema = z.object({
  formUrl: z.string().trim().min(1),
  secretKey: z.string().trim().min(8).optional(),
  sys: z.string().trim().min(1).max(96),
  isEnabled: z.boolean().optional()
});

const productPayloadSchema = z.object({
  kind: z.enum(["one_time", "recurrent"]),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
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

async function parseWebhookPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return {};
  }

  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, typeof value === "string" ? value : String(value)]));
}

function getWebhookOrderId(payload: Record<string, unknown>) {
  const value = payload.order_id ?? payload.orderId ?? payload.order_num;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function getWebhookPaymentId(payload: Record<string, unknown>) {
  const value = payload.payment_id ?? payload.paymentId ?? payload.invoice_id ?? payload.order_id;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function isSuccessfulWebhook(payload: Record<string, unknown>) {
  const status = payload.payment_status ?? payload.status;
  if (typeof status !== "string") {
    return true;
  }
  return ["success", "paid", "completed", "оплачен", "оплачено"].includes(status.toLowerCase());
}

async function grantPaidAccess(order: typeof paymentOrders.$inferSelect, product: PaymentProduct, payload: Record<string, unknown>) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + product.accessDays * 24 * 60 * 60 * 1000);

  await db.insert(subscriptions).values({
    userId: order.userId,
    status: "active",
    provider: product.kind === "recurrent" ? "prodamus_recurrent" : "prodamus",
    providerPaymentId: order.providerOrderId,
    expiresAt,
    createdAt: now,
    updatedAt: now
  });

  if (product.kind === "recurrent" && product.prodamusSubscriptionId) {
    await db
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

  await db
    .update(paymentOrders)
    .set({
      status: "paid",
      providerPaymentId: getWebhookPaymentId(payload),
      paidAt: now,
      rawPayload: payload,
      updatedAt: now
    })
    .where(eq(paymentOrders.id, order.id));
}

export const paymentsRoute = new Hono<{ Variables: AuthVariables }>()
  .post("/prodamus/webhook", async (c) => {
    const payload = await parseWebhookPayload(c.req.raw);
    const provider = await getProdamusProvider();
    const signature = c.req.header("Sign") ?? c.req.header("sign") ?? c.req.header("Signature") ?? c.req.header("signature");
    const orderId = getWebhookOrderId(payload);
    const eventKey = getWebhookPaymentId(payload) ?? orderId ?? randomUUID();
    const isValid = provider ? verifyProdamusSignature(payload, provider.secretKey, signature) : false;

    await db
      .insert(paymentWebhookEvents)
      .values({
        providerId: provider?.id ?? null,
        provider: "prodamus",
        eventKey,
        isValid,
        payload
      })
      .onConflictDoNothing();

    if (!provider || !isValid || !orderId) {
      return c.json({ ok: false }, 400);
    }

    const order = await db.query.paymentOrders.findFirst({
      where: eq(paymentOrders.providerOrderId, orderId)
    });
    if (!order) {
      return c.json({ ok: false }, 404);
    }
    if (order.status === "paid") {
      return c.json({ ok: true });
    }

    const product = await db.query.paymentProducts.findFirst({
      where: eq(paymentProducts.id, order.productId)
    });
    if (!product) {
      return c.json({ ok: false }, 404);
    }

    if (isSuccessfulWebhook(payload)) {
      await grantPaidAccess(order, product, payload);
    } else {
      await db
        .update(paymentOrders)
        .set({ status: "failed", rawPayload: payload, updatedAt: new Date() })
        .where(eq(paymentOrders.id, order.id));
    }

    return c.json({ ok: true });
  })
  .use("*", telegramAuth)
  .get("/plans", async (c) => {
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
  .post("/checkout", async (c) => {
    const body = checkoutPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid checkout payload" }, 400);
    }

    const [provider, product, user] = await Promise.all([
      getProdamusProvider(),
      db.query.paymentProducts.findFirst({
        where: and(eq(paymentProducts.id, body.data.productId), eq(paymentProducts.isPublished, true), activeProductWhere())
      }),
      db.query.users.findFirst({
        where: eq(users.id, c.get("userId"))
      })
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
      sys: provider.sys,
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

    try {
      await setProdamusSubscriptionActivity({
        formUrl: subscription.provider.formUrl,
        secretKey: subscription.provider.secretKey,
        subscriptionId: subscription.prodamusSubscriptionId,
        telegramId: subscription.user.telegramId,
        activeManager: false
      });
    } catch {
      return c.json({ error: "Не удалось отменить подписку в Prodamus." }, 502);
    }

    await db
      .update(userRecurrentSubscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(userRecurrentSubscriptions.id, subscription.id));

    return c.json({ ok: true });
  })
  .get("/admin/provider", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canReadPaymentSettings(role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const provider = await getProdamusProvider();
    return c.json({ provider: provider ? mapProvider(provider) : null, webhookUrl: webhookUrl() });
  })
  .post("/admin/provider/prodamus", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canManagePaymentSettings(role)) {
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

    return c.json({ ok: true, provider: mapProvider(provider) });
  })
  .get("/admin/products", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canReadPaymentSettings(role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const products = await db.query.paymentProducts.findMany({
      where: activeProductWhere(),
      orderBy: [asc(paymentProducts.sortOrder), asc(paymentProducts.createdAt)]
    });

    return c.json({ products: products.map(mapProduct) });
  })
  .post("/admin/products", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canManagePaymentSettings(role)) {
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

    return c.json({ ok: true, product: mapProduct(product) });
  })
  .post("/admin/products/:id", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canManagePaymentSettings(role)) {
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

    return c.json({ ok: true, product: mapProduct(product) });
  })
  .post("/admin/products/:id/status", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canManagePaymentSettings(role)) {
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

    return c.json({ ok: true, product: mapProduct(product) });
  })
  .delete("/admin/products/:id", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (!canManagePaymentSettings(role)) {
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

    return c.json({ ok: true });
  });
