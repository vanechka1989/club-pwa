import { and, asc, desc, eq, gt, isNull, ne, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaymentOrderLog, PaymentProviderCode } from "@club/shared";
import { recordAdminAction } from "../admin/actionLog";
import { getAdminAccessProfile, getUserRole, isOwnerTelegramId } from "../admin/roles";
import { db } from "../db/client";
import {
  paymentOrders,
  individualPaymentOffers,
  paymentProductProviderPrices,
  paymentProviderCatalogItemPrices,
  paymentProviderCatalogItems,
  paymentProductProviderBindings,
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
import { resolveCheckoutProvider } from "../payments/checkoutProvider";
import { getPaymentProviderAdapter } from "../payments/providerRegistry";
import { decryptProviderSecret } from "../payments/providerSecrets";
import { encryptProviderSecret } from "../payments/providerSecrets";
import { lavaWebhookUrls, mapPaymentProviderForAdmin } from "../payments/providerAdminService";
import { validateSingleEnabledPaymentBinding } from "../payments/paymentProductBindings";
import { mapLavaCatalogItem } from "../payments/paymentCatalog";
import { paymentProductMutationError } from "../payments/paymentProductMutation";
import { createCheckoutWithSnapshot, resolveCheckoutMoney } from "../payments/checkoutMoney";
import { type ProductBindingInput } from "../payments/productBindingPrices";
import { productBindingPayloadSchema } from "../payments/productBindingPayload";
import { mapPaymentProduct } from "../payments/productMapping";
import { runProductBindingMutation } from "../payments/productMutationOrchestration";
import { runCheckoutPreflight } from "../payments/checkoutOrchestration";
import { checkoutCurrencyChoiceResponse, checkoutFailureResponse, checkoutPreflightChoiceResult } from "../payments/checkoutCurrencyResponse";
import { isLavaCatalogPriceForProduct } from "../payments/lavaPeriodicity";
import { resolveLavaCheckoutBuyerEmail } from "../payments/lavaCheckoutBuyer";
import { resolvePaymentOrderSnapshot, type ResolvedPaymentOrderSnapshot } from "../payments/paymentOrderSnapshot";

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

const lavaProviderPayloadSchema = z.object({
  apiKey: z.string().trim().min(8).max(512).optional(),
  webhookSecret: z.string().trim().min(16).max(80).optional(),
  testBuyerEmail: z.string().trim().email().max(320).nullable().optional(),
  isEnabled: z.boolean().optional()
});

const productPayloadSchema = z.object({
  kind: z.enum(["one_time", "recurrent"]),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  badgeLabel: z.string().trim().max(32).nullable().optional(),
  amountRub: z.number().int().positive().max(10_000_000).nullable(),
  accessDays: z.number().int().positive().max(3650),
  prodamusSubscriptionId: z.string().trim().max(64).nullable().optional(),
  bindings: z.array(productBindingPayloadSchema).max(2).optional(),
  isPublished: z.boolean().optional()
});

const productStatusPayloadSchema = z.object({
  isPublished: z.boolean()
});

const catalogSelectionPayloadSchema = z.object({
  isSelectable: z.boolean()
});

const checkoutPayloadSchema = z.object({
  productId: z.string().uuid(),
  provider: z.enum(["prodamus", "lava"]).optional(),
  currency: z.enum(["RUB", "USD", "EUR"]).optional()
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

const mapProduct = mapPaymentProduct;

async function getProdamusProvider() {
  return db.query.paymentProviders.findFirst({
    where: eq(paymentProviders.provider, "prodamus")
  });
}

async function getLavaProvider() {
  return db.query.paymentProviders.findFirst({
    where: eq(paymentProviders.provider, "lava")
  });
}

async function replaceProductBindings(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  productId: string,
  bindings: ProductBindingInput[],
  providers: PaymentProvider[],
  now = new Date()
) {
  const providerByCode = new Map(providers.map((provider) => [provider.provider, provider]));
  await tx.delete(paymentProductProviderBindings).where(eq(paymentProductProviderBindings.productId, productId));
  for (const binding of bindings) {
    const provider = providerByCode.get(binding.provider);
    if (!provider) throw new Error("PAYMENT_PROVIDER_NOT_FOUND");
    const [savedBinding] = await tx.insert(paymentProductProviderBindings).values({
      productId,
      providerId: provider.id,
      externalProductId: binding.externalProductId || null,
      externalOfferId: binding.externalOfferId || null,
      isEnabled: binding.enabled,
      createdAt: now,
      updatedAt: now
    }).returning({ id: paymentProductProviderBindings.id });
    if (!savedBinding) throw new Error("PAYMENT_BINDING_NOT_SAVED");
    if (binding.prices.length) {
      await tx.insert(paymentProductProviderPrices).values(binding.prices.map((price) => ({
        bindingId: savedBinding.id,
        currency: price.currency,
        amountMinor: price.amountMinor,
        isEnabled: price.isEnabled,
        createdAt: now,
        updatedAt: now
      })));
    }
  }
}

async function loadLavaCatalogItems(providers: PaymentProvider[]) {
  const lavaProvider = providers.find((provider) => provider.provider === "lava");
  const catalogItems = lavaProvider
    ? await db.query.paymentProviderCatalogItems.findMany({
        where: eq(paymentProviderCatalogItems.providerId, lavaProvider.id),
        with: { prices: true }
      })
    : [];
  return catalogItems.map((item) => ({
    providerId: item.providerId,
    externalOfferId: item.externalOfferId,
    isStale: item.isStale,
    isSelectable: item.isSelectable,
    prices: item.prices.map((price) => ({
      currency: price.currency,
      amountMinor: price.amountMinor,
      periodicity: price.periodicity
    }))
  }));
}

function providerTitle(provider: PaymentProviderCode) {
  return provider === "lava" ? "Lava" : "Prodamus";
}

function providerCredentials(provider: PaymentProvider) {
  return {
    formUrl: provider.formUrl,
    secretKey: provider.secretKey ? decryptProviderSecret(provider.secretKey) : undefined,
    sys: provider.sys,
    apiKey: provider.apiKey ? decryptProviderSecret(provider.apiKey) : undefined,
    webhookSecret: provider.webhookSecret ? decryptProviderSecret(provider.webhookSecret) : undefined
  };
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
    product: PaymentProduct | null;
    provider: PaymentProvider;
  },
  webhook: typeof paymentWebhookEvents.$inferSelect | null
): PaymentOrderLog {
  const product = resolvePaymentOrderSnapshot(order);
  const diagnostic = buildPaymentDiagnostic({
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    webhook: webhook ? { isValid: webhook.isValid, createdAt: webhook.createdAt } : null
  });
  return {
    id: order.id,
    provider: order.provider.provider as PaymentProviderCode,
    status: order.status,
    amountRub: order.amountRub,
    currency: order.currency,
    amountMinor: order.amountMinor,
    providerOrderId: order.providerOrderId,
    providerPaymentId: order.providerPaymentId,
    productTitle: product.title,
    productKind: product.kind,
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
      product: true,
      provider: true
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
    const ids = [
      getWebhookOrderId(event.payload),
      event.payload.contractId,
      event.payload.parentContractId
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    for (const orderId of ids) {
      if (!webhookByOrderId.has(orderId)) webhookByOrderId.set(orderId, event);
    }
  }

  return orders.map((order) => mapPaymentOrderLog(
    order,
    webhookByOrderId.get(order.providerOrderId) ??
      (order.externalOrderId ? webhookByOrderId.get(order.externalOrderId) : undefined) ??
      null
  ));
}

async function grantPaidAccess(
  order: typeof paymentOrders.$inferSelect,
  product: ResolvedPaymentOrderSnapshot & { recurrentExternalProductId: string | null },
  user: typeof users.$inferSelect,
  payload: Record<string, unknown>
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + product.accessDays * 24 * 60 * 60 * 1000);
  const applied = await db.transaction(async (tx) => {
    if (order.individualOfferId) {
      const [claimedOffer] = await tx
        .update(individualPaymentOffers)
        .set({ status: "paid", paidAt: now, updatedAt: now })
        .where(and(
          eq(individualPaymentOffers.id, order.individualOfferId),
          or(eq(individualPaymentOffers.status, "active"), eq(individualPaymentOffers.status, "checkout_pending"))
        ))
        .returning({ id: individualPaymentOffers.id });
      if (!claimedOffer) return false;
      await tx
        .update(paymentOrders)
        .set({ status: "cancelled", updatedAt: now })
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

    if (product.kind === "recurrent" && product.recurrentExternalProductId) {
      const values = {
        userId: order.userId,
        productId: order.productId,
        individualOfferId: order.individualOfferId,
        providerId: order.providerId,
        status: "active" as const,
        prodamusSubscriptionId: product.recurrentExternalProductId,
        createdAt: now,
        updatedAt: now
      };
      const set = { status: "active" as const, cancelledAt: null, updatedAt: now };
      if (order.productId) {
        await tx.insert(userRecurrentSubscriptions).values(values).onConflictDoUpdate({
          target: [userRecurrentSubscriptions.userId, userRecurrentSubscriptions.productId],
          set
        });
      } else {
        await tx.insert(userRecurrentSubscriptions).values(values).onConflictDoUpdate({
          target: [userRecurrentSubscriptions.userId, userRecurrentSubscriptions.individualOfferId],
          set
        });
      }
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
    currency: order.currency,
    amountMinor: order.amountMinor,
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
    const isValid = provider ? verifyProdamusSignature(payload, decryptProviderSecret(provider.secretKey), signature) : false;

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
      where: eq(paymentOrders.providerOrderId, orderId),
      with: { product: true, individualOffer: true }
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

    const user = await db.query.users.findFirst({
        where: eq(users.id, order.userId)
      });
    if (!user) {
      return c.json({ ok: false }, 404);
    }
    let product: ResolvedPaymentOrderSnapshot;
    try {
      product = resolvePaymentOrderSnapshot(order);
    } catch {
      return c.json({ ok: false }, 404);
    }

    if (order.currency !== "RUB" || !validateProdamusWebhookOrder(payload, {
      currency: order.currency,
      amountMinor: order.amountMinor,
      productTitle: product.title
    })) {
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
    await grantPaidAccess(order, {
      ...product,
      recurrentExternalProductId: order.product?.prodamusSubscriptionId ?? order.individualOffer?.externalProductId ?? null
    }, user, payload);
    } else if (paymentStatus === "failed") {
      await db
        .update(paymentOrders)
        .set({ status: "failed", rawPayload: payload, updatedAt: new Date() })
        .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, "paid")));
      if (order.individualOfferId) {
        await db
          .update(individualPaymentOffers)
          .set({ status: "active", updatedAt: new Date() })
          .where(and(
            eq(individualPaymentOffers.id, order.individualOfferId),
            eq(individualPaymentOffers.status, "checkout_pending"),
            gt(individualPaymentOffers.expiresAt, new Date())
          ));
      }
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
        with: {
          providerBindings: {
            with: { provider: true, prices: true }
          }
        },
        orderBy: [asc(paymentProducts.sortOrder), asc(paymentProducts.createdAt)]
      }),
      db.query.userRecurrentSubscriptions.findMany({
        where: eq(userRecurrentSubscriptions.userId, userId),
        with: { product: true, provider: true },
        orderBy: [asc(userRecurrentSubscriptions.createdAt)]
      })
    ]);

    return c.json({
      plans: products.map((product) => ({
        id: product.id,
        title: product.title,
        priceLabel: `${(product.amountRub ?? 0).toLocaleString("ru-RU")} ₽`,
        periodLabel: product.kind === "recurrent" ? `каждые ${product.accessDays} дн.` : `${product.accessDays} дн.`,
        description: product.description ?? "Доступ к клубу и материалам."
      })),
      provider: provider ? mapProvider(provider) : null,
      products: products.map(mapProduct),
      recurrentSubscriptions: recurrentSubscriptions.map((subscription) => ({
        id: subscription.id,
        productId: subscription.productId,
        title: subscription.product?.title ?? "Подписка",
        provider: subscription.provider?.provider === "lava" ? "lava" : "prodamus",
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
    const [product, user, recurrentSubscriptions, membership] = await Promise.all([
      db.query.paymentProducts.findFirst({
        where: and(eq(paymentProducts.id, body.data.productId), eq(paymentProducts.isPublished, true), activeProductWhere()),
        with: {
          provider: true,
          providerBindings: {
            with: { provider: true, prices: true }
          }
        }
      }),
      db.query.users.findFirst({
        where: eq(users.id, userId)
      }),
      db.query.userRecurrentSubscriptions.findMany({
        where: eq(userRecurrentSubscriptions.userId, userId)
      }),
      getMembership(userId)
    ]);

    if (!product) {
      return c.json({ checkoutUrl: null, message: "Тариф недоступен." }, 404);
    }
    if (!user) {
      return c.json({ checkoutUrl: null, message: "Пользователь не найден." }, 404);
    }
    const availableBindings = product.providerBindings.length > 0
      ? product.providerBindings
          .filter((binding) => binding.isEnabled && binding.provider.isEnabled)
          .map((binding) => ({
            provider: binding.provider.provider as PaymentProviderCode,
            title: providerTitle(binding.provider.provider as PaymentProviderCode),
            enabled: true,
            binding: { ...binding, prices: binding.prices }
          }))
      : product.provider?.isEnabled
        ? [{
            provider: "prodamus" as const,
            title: "Prodamus",
            enabled: true,
            binding: {
              provider: product.provider,
              externalProductId: product.prodamusSubscriptionId,
              externalOfferId: null,
              prices: []
            }
          }]
        : [];
    const providerResolution = resolveCheckoutProvider(availableBindings, body.data.provider);
    if (providerResolution.kind === "choice") {
      return c.json({
        checkoutUrl: null,
        message: "Выберите способ оплаты.",
        options: providerResolution.options
      });
    }
    if (providerResolution.kind === "unavailable") {
      return c.json({ checkoutUrl: null, message: "Выбранный способ оплаты сейчас недоступен." }, 400);
    }
    const selected = availableBindings.find((binding) => binding.provider === providerResolution.provider);
    if (!selected) {
      return c.json({ checkoutUrl: null, message: "Платежная система пока не подключена." }, 400);
    }
    const checkoutBuyerEmail = selected.provider === "lava"
      ? resolveLavaCheckoutBuyerEmail({
          isOwner: await isOwnerTelegramId(user.telegramId),
          userEmail: user.email,
          testBuyerEmail: selected.binding.provider.testBuyerEmail
        })
      : user.email;
    const legacyAmountRub = typeof product.amountRub === "number" && Number.isInteger(product.amountRub) && product.amountRub > 0
      ? product.amountRub
      : null;
    const fallbackPrices = legacyAmountRub === null
      ? []
      : [{ currency: "RUB" as const, amountMinor: legacyAmountRub * 100, isEnabled: true }];
    const moneyResolution = resolveCheckoutMoney(
      selected.binding.prices.length ? selected.binding.prices : fallbackPrices,
      body.data.currency,
      selected.provider
    );
    if (moneyResolution.kind === "choice") {
      return c.json(checkoutCurrencyChoiceResponse(moneyResolution.options));
    }
    if (moneyResolution.kind === "unavailable") {
      return c.json({ checkoutUrl: null, message: "Выбранная валюта оплаты сейчас недоступна." }, 400);
    }
    const money = moneyResolution;
    if (selected.provider === "lava" && (!checkoutBuyerEmail || !selected.binding.externalOfferId)) {
      return c.json({
        checkoutUrl: null,
        message: !checkoutBuyerEmail
          ? "Для оплаты через Lava в профиле должен быть указан email."
          : "Для тарифа не выбрано предложение Lava."
      }, 400);
    }
    if (selected.provider === "prodamus" && product.kind === "recurrent" && !selected.binding.externalProductId) {
      return c.json({ checkoutUrl: null, message: "У рекуррентного тарифа не указан ID подписки Prodamus." }, 400);
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

    const lavaCatalogItem = selected.provider === "lava" && selected.binding.externalOfferId
      ? await db.query.paymentProviderCatalogItems.findFirst({
          where: and(
            eq(paymentProviderCatalogItems.providerId, selected.binding.provider.id),
            eq(paymentProviderCatalogItems.externalOfferId, selected.binding.externalOfferId)
          ),
          with: { prices: true }
        })
      : null;
    const catalogPrice = lavaCatalogItem?.prices.find((price) =>
      price.currency === money.currency &&
      isLavaCatalogPriceForProduct(price.periodicity, product.kind, product.accessDays)
    );
    const now = new Date();
    const orderId = `club-${randomUUID()}`;
    const created = { order: null as typeof paymentOrders.$inferSelect | null };

    try {
      const adapter = getPaymentProviderAdapter(selected.provider);
      const preflight = await runCheckoutPreflight({
        provider: selected.provider,
        requestedCurrency: body.data.currency,
        prices: selected.binding.prices,
        amountRub: product.amountRub,
        kind: product.kind,
        accessDays: product.accessDays,
        catalogItem: lavaCatalogItem ?? null,
        createOrder: async (selectedMoney) => createCheckoutWithSnapshot({
        snapshot: selectedMoney,
        createOrder: async (snapshot) => {
          const [order] = await db
            .insert(paymentOrders)
            .values({
              userId: user.id,
              productId: product.id,
              providerId: selected.binding.provider.id,
              status: "pending",
              ...snapshot,
              providerOrderId: orderId,
              createdAt: now,
              updatedAt: now
            })
            .returning();
          created.order = order ?? null;
          return order ?? null;
        },
        createAdapterCheckout: (order, snapshot) => adapter.createCheckout({
          credentials: providerCredentials(selected.binding.provider),
          orderId: order.providerOrderId,
          user: {
            id: user.id,
            telegramId: user.telegramId,
            email: checkoutBuyerEmail
          },
          product: {
            title: product.title,
            ...snapshot,
            useCustomAmount: selected.provider === "lava" && catalogPrice?.amountMinor === null,
            kind: product.kind,
            accessDays: product.accessDays,
            externalProductId: selected.binding.externalProductId,
            externalOfferId: selected.binding.externalOfferId
          },
          returnUrl: `${env.WEB_ORIGIN.replace(/\/$/, "")}/`,
          notificationUrl: selected.provider === "lava"
            ? `${env.WEB_ORIGIN.replace(/\/$/, "")}/api/payments/lava/webhook/payment`
            : webhookUrl()
        }),
        persistExternalOrderId: async (_order, externalOrderId) => {
          if (!created.order) return;
          await db
            .update(paymentOrders)
            .set({ externalOrderId, updatedAt: new Date() })
            .where(eq(paymentOrders.id, created.order.id));
        }
        })
      });
      if (preflight.kind === "drift") {
        return c.json({ checkoutUrl: null, message: "Цена товара в Lava изменилась. Обновите тариф." }, 409);
      }
      if (preflight.kind === "choice") {
        const response = checkoutPreflightChoiceResult(preflight);
        return c.json(response.body, response.status);
      }
      if (preflight.kind === "unavailable") {
        return c.json({ checkoutUrl: null, message: "Выбранная валюта оплаты сейчас недоступна." }, 400);
      }
      const checkout = preflight.value as { checkoutUrl: string; externalOrderId: string | null } | null;
      if (!checkout) return c.json({ checkoutUrl: null, message: "Не удалось создать заказ." }, 500);
      return c.json({
        checkoutUrl: checkout.checkoutUrl,
        message: `Откройте платежную страницу ${providerTitle(selected.provider)}.`
      });
    } catch (error) {
      logger.warn({
        code: error instanceof Error ? error.message : "PAYMENT_CHECKOUT_FAILED",
        provider: selected.provider,
        orderId: created.order?.providerOrderId ?? orderId
      }, "payment checkout creation failed");
      if (created.order) {
        await db
          .update(paymentOrders)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(paymentOrders.id, created.order.id));
      }
      const failure = checkoutFailureResponse(error);
      return c.json(failure.body, failure.status);
    }
  })
  .post("/recurrent-subscriptions/:id/cancel", async (c) => {
    const subscription = await db.query.userRecurrentSubscriptions.findFirst({
      where: and(eq(userRecurrentSubscriptions.id, c.req.param("id")), eq(userRecurrentSubscriptions.userId, c.get("userId"))),
      with: {
        product: true,
        individualOffer: true,
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
    if ((subscription.product?.kind ?? subscription.individualOffer?.kind) !== "recurrent") {
      return c.json({ error: "Отмена доступна только для рекуррентной подписки." }, 400);
    }

    if (subscription.provider.provider === "lava") {
      if (!subscription.externalSubscriptionId || !subscription.user.email) {
        return c.json({ error: "Не удалось определить подписку Lava." }, 400);
      }
      try {
        const adapter = getPaymentProviderAdapter("lava");
        if (!adapter.cancelSubscription) {
          return c.json({ error: "Отмена подписки Lava временно недоступна." }, 503);
        }
        await adapter.cancelSubscription({
          credentials: providerCredentials(subscription.provider),
          externalSubscriptionId: subscription.externalSubscriptionId,
          customerEmail: subscription.user.email
        });
      } catch (error) {
        logger.warn({
          code: error instanceof Error ? error.message : "LAVA_SUBSCRIPTION_CANCEL_FAILED",
          subscriptionId: subscription.id
        }, "Lava subscription cancellation failed");
        return c.json({ error: "Не удалось отменить подписку в Lava." }, 502);
      }

      await db
        .update(userRecurrentSubscriptions)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(userRecurrentSubscriptions.id, subscription.id));
      return c.json({ ok: true });
    }

    if (subscription.provider.provider !== "prodamus" || !subscription.prodamusSubscriptionId) {
      return c.json({ error: "Не удалось определить подписку Prodamus." }, 400);
    }

    const latestPaidOrder = await db.query.paymentOrders.findFirst({
      where: and(
        eq(paymentOrders.userId, subscription.userId),
        or(
          subscription.productId ? eq(paymentOrders.productId, subscription.productId) : undefined,
          subscription.individualOfferId ? eq(paymentOrders.individualOfferId, subscription.individualOfferId) : undefined
        ),
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
        secretKey: decryptProviderSecret(subscription.provider.secretKey),
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
        individualOffer: true,
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
    if (subscription.provider.provider === "lava") {
      return c.json({
        ok: false,
        action: "resubscribe",
        error: "Подписку Lava нужно оформить снова."
      }, 409);
    }
    if (
      (subscription.product?.kind ?? subscription.individualOffer?.kind) !== "recurrent" ||
      subscription.provider.provider !== "prodamus" ||
      !subscription.prodamusSubscriptionId
    ) {
      return c.json({ error: "Restore is available only for recurrent Prodamus subscriptions" }, 400);
    }

    const membership = await getMembership(subscription.userId);
    if (!membership.isActive || membership.subscription?.provider !== "prodamus_recurrent") {
      return c.json({ error: "Восстановить подписку можно только пока доступ ещё активен." }, 409);
    }

    const latestPaidOrder = await db.query.paymentOrders.findFirst({
      where: and(
        eq(paymentOrders.userId, subscription.userId),
        or(
          subscription.productId ? eq(paymentOrders.productId, subscription.productId) : undefined,
          subscription.individualOfferId ? eq(paymentOrders.individualOfferId, subscription.individualOfferId) : undefined
        ),
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
        secretKey: decryptProviderSecret(subscription.provider.secretKey),
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
  .get("/admin/providers", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canReadPaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const providers = await db.query.paymentProviders.findMany({
      orderBy: [asc(paymentProviders.createdAt)]
    });
    return c.json({
      providers: providers.map((provider) => mapPaymentProviderForAdmin(provider, env.WEB_ORIGIN)),
      lavaWebhookUrls: lavaWebhookUrls(env.WEB_ORIGIN)
    });
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
      secretKey: body.data.secretKey ? encryptProviderSecret(body.data.secretKey) : existing?.secretKey ?? "",
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
  .post("/admin/providers/lava", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const body = lavaProviderPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid Lava provider payload" }, 400);
    }
    const existing = await getLavaProvider();
    if (!existing && (!body.data.apiKey || !body.data.webhookSecret)) {
      return c.json({ error: "Для подключения Lava нужны API-ключ и ключ webhook." }, 400);
    }
    const now = new Date();
    const values = {
      provider: "lava",
      title: "Lava",
      formUrl: "",
      secretKey: "",
      sys: "",
      apiKey: body.data.apiKey ? encryptProviderSecret(body.data.apiKey) : existing?.apiKey ?? null,
      webhookSecret: body.data.webhookSecret
        ? encryptProviderSecret(body.data.webhookSecret)
        : existing?.webhookSecret ?? null,
      testBuyerEmail: body.data.testBuyerEmail === undefined
        ? existing?.testBuyerEmail ?? null
        : body.data.testBuyerEmail,
      isEnabled: body.data.isEnabled ?? true,
      createdByUserId: c.get("userId"),
      lastCheckedAt: body.data.apiKey ? null : existing?.lastCheckedAt ?? null,
      lastCheckError: body.data.apiKey ? null : existing?.lastCheckError ?? null,
      updatedAt: now
    };
    const [provider] = existing
      ? await db.update(paymentProviders).set(values).where(eq(paymentProviders.id, existing.id)).returning()
      : await db.insert(paymentProviders).values({ ...values, createdAt: now }).returning();
    if (!provider) return c.json({ error: "Unable to save Lava provider" }, 500);

    await recordAdminAction(c, {
      action: existing ? "payment.provider.updated" : "payment.provider.created",
      entityType: "payment_provider",
      entityId: provider.id,
      summary: existing ? "Обновил платёжного провайдера Lava" : "Подключил платёжного провайдера Lava",
      metadata: {
        isEnabled: provider.isEnabled,
        apiKey: body.data.apiKey ? "[changed]" : "[unchanged]",
        webhookSecret: body.data.webhookSecret ? "[changed]" : "[unchanged]",
        testBuyerEmail: body.data.testBuyerEmail === undefined ? "[unchanged]" : "[changed]"
      }
    });
    return c.json({ ok: true, provider: mapPaymentProviderForAdmin(provider, env.WEB_ORIGIN) });
  })
  .post("/admin/providers/lava/webhook-secret", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const provider = await getLavaProvider();
    if (!provider?.webhookSecret) {
      return c.json({ error: "Ключ webhook Lava не настроен." }, 404);
    }

    await recordAdminAction(c, {
      action: "payment.provider.webhook_secret.revealed",
      entityType: "payment_provider",
      entityId: provider.id,
      summary: "Скопировал сохранённый ключ webhook Lava",
      metadata: {}
    });

    return c.json({
      ok: true,
      webhookSecret: decryptProviderSecret(provider.webhookSecret)
    });
  })
  .post("/admin/providers/lava/check", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const provider = await getLavaProvider();
    if (!provider?.apiKey) {
      return c.json({ error: "Lava не подключена." }, 400);
    }
    const now = new Date();
    try {
      await getPaymentProviderAdapter("lava").checkConnection(providerCredentials(provider));
      const [updated] = await db
        .update(paymentProviders)
        .set({ lastCheckedAt: now, lastCheckError: null, updatedAt: now })
        .where(eq(paymentProviders.id, provider.id))
        .returning();
      return c.json({ ok: true, provider: mapPaymentProviderForAdmin(updated ?? provider, env.WEB_ORIGIN) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "LAVA_CHECK_FAILED";
      const [updated] = await db
        .update(paymentProviders)
        .set({ lastCheckedAt: now, lastCheckError: code, updatedAt: now })
        .where(eq(paymentProviders.id, provider.id))
        .returning();
      logger.warn({ code }, "Lava connection check failed");
      return c.json({
        ok: false,
        error: "Не удалось проверить подключение Lava.",
        provider: mapPaymentProviderForAdmin(updated ?? provider, env.WEB_ORIGIN)
      }, 502);
    }
  })
  .post("/admin/providers/lava/catalog/sync", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const provider = await getLavaProvider();
    if (!provider?.apiKey) {
      return c.json({ error: "Lava не подключена." }, 400);
    }
    try {
      const items = await getPaymentProviderAdapter("lava").listCatalog(providerCredentials(provider));
      const syncedAt = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(paymentProviderCatalogItems)
          .set({ isStale: true })
          .where(eq(paymentProviderCatalogItems.providerId, provider.id));
        for (const item of items) {
          const [catalogItem] = await tx
            .insert(paymentProviderCatalogItems)
            .values({
              providerId: provider.id,
              externalProductId: item.externalProductId,
              externalOfferId: item.externalOfferId ?? "",
              title: item.title,
              kind: item.kind,
              amountRub: item.amountRub === null ? null : Math.round(item.amountRub),
              isStale: false,
              metadata: item.metadata,
              syncedAt
            })
            .onConflictDoUpdate({
              target: [
                paymentProviderCatalogItems.providerId,
                paymentProviderCatalogItems.externalProductId,
                paymentProviderCatalogItems.externalOfferId
              ],
              set: {
                title: item.title,
                kind: item.kind,
                amountRub: item.amountRub === null ? null : Math.round(item.amountRub),
                isStale: false,
                metadata: item.metadata,
                syncedAt
              }
            })
            .returning({ id: paymentProviderCatalogItems.id });
          if (!catalogItem) throw new Error("LAVA_CATALOG_ITEM_NOT_SAVED");
          await tx.delete(paymentProviderCatalogItemPrices).where(eq(paymentProviderCatalogItemPrices.catalogItemId, catalogItem.id));
          if (item.prices.length) {
            await tx.insert(paymentProviderCatalogItemPrices).values(item.prices.map((price) => ({
              catalogItemId: catalogItem.id,
              currency: price.currency,
              amountMinor: price.amountMinor,
              periodicity: price.periodicity ?? "ONE_TIME",
              createdAt: syncedAt,
              updatedAt: syncedAt
            })));
          }
        }
        await tx
          .update(paymentProviders)
          .set({ lastCatalogSyncAt: syncedAt, updatedAt: syncedAt })
          .where(eq(paymentProviders.id, provider.id));
      });
      return c.json({ ok: true, count: items.length });
    } catch (error) {
      const code = error instanceof Error ? error.message : "LAVA_CATALOG_SYNC_FAILED";
      logger.warn({ code }, "Lava catalog sync failed");
      return c.json({ error: "Не удалось синхронизировать товары Lava." }, 502);
    }
  })
  .get("/admin/providers/lava/catalog", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canReadPaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const provider = await getLavaProvider();
    if (!provider) return c.json({ items: [], syncedAt: null });
    const items = await db.query.paymentProviderCatalogItems.findMany({
      where: eq(paymentProviderCatalogItems.providerId, provider.id),
      with: { prices: true },
      orderBy: [asc(paymentProviderCatalogItems.title)]
    });
    return c.json({
      items: items.map(mapLavaCatalogItem),
      syncedAt: provider.lastCatalogSyncAt?.toISOString() ?? null
    });
  })
  .post("/admin/providers/lava/catalog/:id/selection", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const body = catalogSelectionPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid catalog selection payload" }, 400);
    }
    const provider = await getLavaProvider();
    if (!provider) {
      return c.json({ error: "Lava не подключена." }, 400);
    }
    const [item] = await db
      .update(paymentProviderCatalogItems)
      .set({ isSelectable: body.data.isSelectable })
      .where(and(
        eq(paymentProviderCatalogItems.id, c.req.param("id")),
        eq(paymentProviderCatalogItems.providerId, provider.id)
      ))
      .returning();
    if (!item) {
      return c.json({ error: "Товар Lava не найден." }, 404);
    }
    return c.json({ ok: true });
  })
  .get("/admin/products", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canReadPaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const products = await db.query.paymentProducts.findMany({
      where: activeProductWhere(),
      with: {
        providerBindings: {
          with: { provider: true, prices: true }
        }
      },
      orderBy: [asc(paymentProducts.sortOrder), asc(paymentProducts.createdAt)]
    });

    return c.json({ products: products.map(mapProduct) });
  })
  .post("/admin/products", async (c) => {
    const access = await getPaymentAdminAccess(c);
    if (!canManagePaymentSettings(access.role, access.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = productPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid product payload" }, 400);
    }
    const providers = await db.query.paymentProviders.findMany();
    const requestedBindings = body.data.bindings ?? [{
      provider: "prodamus" as const,
      enabled: true,
      externalProductId: body.data.prodamusSubscriptionId ?? null,
      externalOfferId: null,
      prices: []
    }];
    const bindingSelection = validateSingleEnabledPaymentBinding(requestedBindings);
    if (!bindingSelection.ok) {
      return c.json({ error: bindingSelection.error }, 400);
    }
    const moneyError = paymentProductMutationError(body.data.amountRub, requestedBindings);
    if (moneyError) return c.json({ error: moneyError }, 400);
    const enabledBindings = requestedBindings.filter((binding) => binding.enabled);
    const providerByCode = new Map(providers.map((provider) => [provider.provider, provider]));
    const primaryProvider = providerByCode.get(enabledBindings[0]!.provider);
    if (!primaryProvider) {
      return c.json({ error: "Сначала подключите выбранную платёжную систему." }, 400);
    }
    const invalidBinding = enabledBindings.find((binding) =>
      binding.provider === "lava"
        ? !binding.externalOfferId
        : body.data.kind === "recurrent" && !binding.externalProductId
    );
    if (invalidBinding) {
      return c.json({
        error: invalidBinding.provider === "lava"
          ? "Для Lava выберите предложение."
          : "Для рекуррентного тарифа нужен ID подписки Prodamus."
      }, 400);
    }

    const catalogItems = await loadLavaCatalogItems(providers);
    const mutation = await runProductBindingMutation({
      bindings: requestedBindings,
      providers: providers.map((provider) => ({ id: provider.id, provider: provider.provider as PaymentProviderCode })),
      catalogItems,
      amountRub: body.data.amountRub,
      kind: body.data.kind,
      accessDays: body.data.accessDays,
      transaction: async (preparedBindings) => {
        const now = new Date();
        return db.transaction(async (tx) => {
          const [savedProduct] = await tx
            .insert(paymentProducts)
            .values({
              providerId: primaryProvider.id,
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
          if (!savedProduct) return null;
          await replaceProductBindings(tx, savedProduct.id, preparedBindings, providers, now);
          return savedProduct;
        });
      }
    });
    if (!mutation.ok) return c.json({ error: mutation.error }, 400);
    const product = mutation.value;

    if (!product) {
      return c.json({ error: "Unable to create product" }, 500);
    }
    const savedProduct = await db.query.paymentProducts.findFirst({
      where: eq(paymentProducts.id, product.id),
      with: { providerBindings: { with: { provider: true, prices: true } } }
    });

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

    return c.json({ ok: true, product: mapProduct(savedProduct ?? product) });
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
    const existingProduct = await db.query.paymentProducts.findFirst({
      where: and(eq(paymentProducts.id, c.req.param("id")), activeProductWhere()),
      with: { providerBindings: { with: { provider: true, prices: true } } }
    });
    if (!existingProduct) return c.json({ error: "Product not found" }, 404);
    const requestedBindings = body.data.bindings ?? (existingProduct.providerBindings.length > 0
      ? existingProduct.providerBindings.map((binding) => ({
          provider: binding.provider.provider === "lava" ? "lava" as const : "prodamus" as const,
          enabled: binding.isEnabled,
          externalProductId: binding.externalProductId,
          externalOfferId: binding.externalOfferId,
          prices: binding.prices.map((price) => ({
            currency: price.currency,
            amountMinor: price.amountMinor,
            isEnabled: price.isEnabled
          }))
        }))
      : [{
          provider: "prodamus" as const,
          enabled: true,
          externalProductId: body.data.prodamusSubscriptionId ?? existingProduct.prodamusSubscriptionId,
          externalOfferId: null,
          prices: []
        }]);
    const bindingSelection = validateSingleEnabledPaymentBinding(requestedBindings);
    if (!bindingSelection.ok) {
      return c.json({ error: bindingSelection.error }, 400);
    }
    const moneyError = paymentProductMutationError(body.data.amountRub, requestedBindings);
    if (moneyError) return c.json({ error: moneyError }, 400);
    const enabledBindings = requestedBindings.filter((binding) => binding.enabled);
    const providers = await db.query.paymentProviders.findMany();
    const primaryProvider = providers.find((provider) => provider.provider === enabledBindings[0]!.provider);
    if (!primaryProvider) {
      return c.json({ error: "Сначала подключите выбранную платёжную систему." }, 400);
    }
    const invalidBinding = enabledBindings.find((binding) =>
      binding.provider === "lava"
        ? !binding.externalOfferId
        : body.data.kind === "recurrent" && !binding.externalProductId
    );
    if (invalidBinding) {
      return c.json({
        error: invalidBinding.provider === "lava"
          ? "Для Lava выберите предложение."
          : "Для рекуррентного тарифа нужен ID подписки Prodamus."
      }, 400);
    }

    const catalogItems = await loadLavaCatalogItems(providers);
    const mutation = await runProductBindingMutation({
      bindings: requestedBindings,
      providers: providers.map((provider) => ({ id: provider.id, provider: provider.provider as PaymentProviderCode })),
      catalogItems,
      amountRub: body.data.amountRub,
      kind: body.data.kind,
      accessDays: body.data.accessDays,
      existingAmountRub: existingProduct.amountRub,
      existingBindings: existingProduct.providerBindings.map((binding) => ({
        provider: binding.provider.provider as PaymentProviderCode,
        enabled: binding.isEnabled,
        externalProductId: binding.externalProductId,
        externalOfferId: binding.externalOfferId,
        prices: binding.prices.map((price) => ({ currency: price.currency, amountMinor: price.amountMinor, isEnabled: price.isEnabled }))
      })),
      transaction: async (preparedBindings) => {
        const now = new Date();
        return db.transaction(async (tx) => {
          const [savedProduct] = await tx
            .update(paymentProducts)
            .set({
              providerId: primaryProvider.id,
              kind: body.data.kind,
              title: body.data.title,
              description: body.data.description ?? null,
              badgeLabel: body.data.badgeLabel || null,
              amountRub: body.data.amountRub,
              accessDays: body.data.accessDays,
              prodamusSubscriptionId: body.data.prodamusSubscriptionId ?? null,
              isPublished: body.data.isPublished ?? false,
              updatedAt: now
            })
            .where(and(eq(paymentProducts.id, c.req.param("id")), activeProductWhere()))
            .returning();
          if (!savedProduct) return null;
          await replaceProductBindings(tx, savedProduct.id, preparedBindings, providers, now);
          return savedProduct;
        });
      }
    });
    if (!mutation.ok) return c.json({ error: mutation.error }, 400);
    const product = mutation.value;

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }
    const savedProduct = await db.query.paymentProducts.findFirst({
      where: eq(paymentProducts.id, product.id),
      with: { providerBindings: { with: { provider: true, prices: true } } }
    });

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

    return c.json({ ok: true, product: mapProduct(savedProduct ?? product) });
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
    const savedProduct = await db.query.paymentProducts.findFirst({
      where: eq(paymentProducts.id, product.id),
      with: { providerBindings: { with: { provider: true, prices: true } } }
    });

    await recordAdminAction(c, {
      action: "payment.product.status_updated",
      entityType: "payment_product",
      entityId: product.id,
      summary: body.data.isPublished ? `Опубликовал тариф "${product.title}"` : `Скрыл тариф "${product.title}"`,
      metadata: {
        isPublished: product.isPublished
      }
    });

    return c.json({ ok: true, product: mapProduct(savedProduct ?? product) });
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
