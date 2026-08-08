import { adminIndividualPaymentOfferPayloadSchema, type IndividualPaymentOffer } from "@club/shared";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { recordAdminAction } from "../admin/actionLog";
import { getUserRole, hasAdminPermission } from "../admin/roles";
import { db } from "../db/client";
import {
  individualPaymentOffers,
  paymentProviderCatalogItems,
  userRecurrentSubscriptions,
  users
} from "../db/schema";
import { env } from "../env";
import { getMembership } from "../membership/getMembership";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { createAppNotification } from "../notifications/create";
import { buildIndividualOfferDraft, buildIndividualOfferNotification } from "../payments/individualOfferService";
import { createIndividualOfferToken } from "../payments/individualOfferPolicy";
import { mapLavaCatalogItem } from "../payments/paymentCatalog";
import { mapPaymentProviderForAdmin } from "../payments/providerAdminService";
import { hasBlockingRecurrentSubscription } from "../payments/recurrentCheckoutGuard";

const offerTtlMs = 24 * 60 * 60 * 1000;

function databaseErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

async function requireOfferAdmin(c: Context<{ Variables: AuthVariables }>) {
  const telegramId = c.get("telegramUser").id;
  if (!(await hasAdminPermission(telegramId, "accesses"))) {
    return c.json({ error: "Access permission required" }, 403);
  }
  return null;
}

async function resolveTarget(c: Context<{ Variables: AuthVariables }>) {
  const telegramId = c.req.param("telegramId");
  if (!telegramId) return { target: null, error: c.json({ error: "Client not found" }, 404) };
  const target = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!target) return { target: null, error: c.json({ error: "Client not found" }, 404) };
  const [actorRole, targetRole] = await Promise.all([getUserRole(c.get("telegramUser").id), getUserRole(target.telegramId)]);
  if (targetRole !== "member" && actorRole !== "owner") {
    return { target: null, error: c.json({ error: "Owner access required" }, 403) };
  }
  return { target, error: null };
}

function creatorTitle(user: typeof users.$inferSelect) {
  return user.firstName || (user.username ? `@${user.username}` : user.email || user.telegramId);
}

function serializeOffer(
  offer: typeof individualPaymentOffers.$inferSelect & {
    createdBy: typeof users.$inferSelect;
    orders: Array<{ id: string; status: "pending" | "paid" | "failed" | "cancelled"; paidAt: Date | null; createdAt: Date }>;
  },
  now = new Date()
): IndividualPaymentOffer {
  const order = [...offer.orders].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
  const status: IndividualPaymentOffer["status"] = offer.status === "active" || (offer.status === "checkout_pending" && offer.provider === "prodamus")
    ? now.getTime() >= offer.expiresAt.getTime() ? "expired" : offer.status
    : offer.status as IndividualPaymentOffer["status"];
  return {
    id: offer.id,
    provider: offer.provider as "prodamus" | "lava",
    kind: offer.kind,
    title: offer.title,
    currency: offer.currency,
    amountMinor: offer.amountMinor,
    accessType: offer.accessType,
    accessDays: offer.accessDays,
    status,
    expiresAt: offer.expiresAt.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    firstOpenedAt: offer.firstOpenedAt?.toISOString() ?? null,
    checkoutStartedAt: offer.checkoutStartedAt?.toISOString() ?? null,
    paidAt: offer.paidAt?.toISOString() ?? order?.paidAt?.toISOString() ?? null,
    cancelledAt: offer.cancelledAt?.toISOString() ?? null,
    createdBy: creatorTitle(offer.createdBy),
    orderId: order?.id ?? null
  };
}

async function listOffers(userId: string) {
  await db
    .update(individualPaymentOffers)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(
      eq(individualPaymentOffers.userId, userId),
      or(
        eq(individualPaymentOffers.status, "active"),
        and(eq(individualPaymentOffers.status, "checkout_pending"), eq(individualPaymentOffers.provider, "prodamus"))
      ),
      lt(individualPaymentOffers.expiresAt, new Date())
    ));
  const offers = await db.query.individualPaymentOffers.findMany({
    where: eq(individualPaymentOffers.userId, userId),
    with: { createdBy: true, orders: true },
    orderBy: [desc(individualPaymentOffers.createdAt)],
    limit: 100
  });
  return offers.map((offer) => serializeOffer(offer));
}

async function loadCreationContext() {
  const providers = await db.query.paymentProviders.findMany();
  const lavaProvider = providers.find((provider) => provider.provider === "lava");
  const lavaCatalog = lavaProvider
    ? await db.query.paymentProviderCatalogItems.findMany({
        where: eq(paymentProviderCatalogItems.providerId, lavaProvider.id),
        with: { prices: true },
        orderBy: [paymentProviderCatalogItems.title]
      })
    : [];
  return { providers, lavaCatalog };
}

export const adminIndividualPaymentOffersRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .use("*", async (c, next) => {
    const error = await requireOfferAdmin(c);
    if (error) return error;
    await next();
  })
  .get("/users/:telegramId", async (c) => {
    const { target, error } = await resolveTarget(c);
    if (error || !target) return error!;
    return c.json({ offers: await listOffers(target.id) });
  })
  .get("/users/:telegramId/options", async (c) => {
    const { target, error } = await resolveTarget(c);
    if (error || !target) return error!;
    const context = await loadCreationContext();
    return c.json({
      providers: context.providers
        .filter((provider) => provider.isEnabled && (
          (provider.provider === "prodamus" && Boolean(provider.secretKey)) ||
          (provider.provider === "lava" && Boolean(provider.apiKey) && Boolean(provider.webhookSecret))
        ))
        .map((provider) => mapPaymentProviderForAdmin(provider, env.WEB_ORIGIN)),
      lavaCatalog: context.lavaCatalog.filter((item) => item.isSelectable).map(mapLavaCatalogItem),
      lavaCatalogSyncedAt: context.providers.find((provider) => provider.provider === "lava")?.lastCatalogSyncAt?.toISOString() ?? null
    });
  })
  .post("/users/:telegramId", async (c) => {
    const { target, error } = await resolveTarget(c);
    if (error || !target) return error!;
    const body = adminIndividualPaymentOfferPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.flatten() }, 400);
    const context = await loadCreationContext();
    let draft;
    try {
      draft = buildIndividualOfferDraft(body.data, context);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "INDIVIDUAL_OFFER_INVALID";
      return c.json({ error: code }, code.includes("UNAVAILABLE") ? 409 : 400);
    }
    const now = new Date();
    if (draft.kind === "recurrent") {
      await db.update(individualPaymentOffers).set({ status: "expired", updatedAt: now }).where(and(
        eq(individualPaymentOffers.userId, target.id),
        eq(individualPaymentOffers.kind, "recurrent"),
        or(
          eq(individualPaymentOffers.status, "active"),
          and(eq(individualPaymentOffers.status, "checkout_pending"), eq(individualPaymentOffers.provider, "prodamus"))
        ),
        lt(individualPaymentOffers.expiresAt, now)
      ));
      const [subscriptions, membership, openOffer] = await Promise.all([
        db.query.userRecurrentSubscriptions.findMany({ where: eq(userRecurrentSubscriptions.userId, target.id) }),
        getMembership(target.id),
        db.query.individualPaymentOffers.findFirst({
          where: and(
            eq(individualPaymentOffers.userId, target.id),
            eq(individualPaymentOffers.kind, "recurrent"),
            inArray(individualPaymentOffers.status, ["active", "checkout_pending"])
          )
        })
      ]);
      if (openOffer || hasBlockingRecurrentSubscription(subscriptions, {
        isActiveMembership: membership.isActive,
        subscriptionProvider: membership.subscription?.provider ?? null
      })) {
        return c.json({ error: "У клиента уже есть активная, восстанавливаемая или ожидающая оплаты автоподписка." }, 409);
      }
    }
    const expiresAt = new Date(now.getTime() + offerTtlMs);
    const { token, tokenHash } = createIndividualOfferToken();
    let offer: typeof individualPaymentOffers.$inferSelect | undefined;
    try {
      [offer] = await db.insert(individualPaymentOffers).values({
        userId: target.id,
        createdByUserId: c.get("userId"),
        ...draft,
        tokenHash,
        status: "active",
        expiresAt,
        createdAt: now,
        updatedAt: now
      }).returning();
    } catch (cause) {
      if (databaseErrorCode(cause) === "23505" && draft.kind === "recurrent") {
        return c.json({ error: "Для клиента уже создана ожидающая оплаты автоподписка." }, 409);
      }
      throw cause;
    }
    if (!offer) return c.json({ error: "Unable to create offer" }, 500);
    const appPath = `/payments/offers/${token}`;
    const notification = buildIndividualOfferNotification({
      title: offer.title,
      currency: offer.currency,
      amountMinor: offer.amountMinor,
      accessType: offer.accessType,
      accessDays: offer.accessDays,
      expiresAt,
      appPath
    });
    let delivery;
    try {
      delivery = await createAppNotification({
        userId: target.id,
        kind: "payment",
        ...notification,
        source: "individual_payment_offer",
        sourceId: offer.id
      }, { waitForPush: true });
      if (!delivery.notification) throw new Error("INDIVIDUAL_OFFER_NOTIFICATION_NOT_CREATED");
    } catch (cause) {
      await db.delete(individualPaymentOffers).where(eq(individualPaymentOffers.id, offer.id));
      throw cause;
    }
    await recordAdminAction(c, {
      action: "client.payment_offer.created",
      entityType: "individual_payment_offer",
      entityId: offer.id,
      targetUserId: target.id,
      targetTelegramId: target.telegramId,
      summary: `Создал персональное предложение «${offer.title}»`,
      metadata: {
        provider: offer.provider,
        kind: offer.kind,
        currency: offer.currency,
        amountMinor: offer.amountMinor,
        accessType: offer.accessType,
        accessDays: offer.accessDays,
        expiresAt: offer.expiresAt.toISOString()
      }
    });
    const saved = (await db.query.individualPaymentOffers.findFirst({
      where: eq(individualPaymentOffers.id, offer.id),
      with: { createdBy: true, orders: true }
    }))!;
    return c.json({
      ok: true as const,
      offer: serializeOffer(saved),
      link: `${env.WEB_ORIGIN.replace(/\/$/, "")}${appPath}`,
      pushDelivered: delivery.pushDelivered
    }, 201);
  })
  .post("/users/:telegramId/:offerId/cancel", async (c) => {
    const { target, error } = await resolveTarget(c);
    if (error || !target) return error!;
    const now = new Date();
    const [offer] = await db.update(individualPaymentOffers).set({
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now
    }).where(and(
      eq(individualPaymentOffers.id, c.req.param("offerId")),
      eq(individualPaymentOffers.userId, target.id),
      eq(individualPaymentOffers.status, "active")
    )).returning();
    if (!offer) return c.json({ error: "Активную оплату нельзя отменить: дождитесь результата или истечения платёжной сессии." }, 409);
    await recordAdminAction(c, {
      action: "client.payment_offer.cancelled",
      entityType: "individual_payment_offer",
      entityId: offer.id,
      targetUserId: target.id,
      targetTelegramId: target.telegramId,
      summary: `Отменил персональное предложение «${offer.title}»`,
      metadata: { provider: offer.provider, status: "cancelled" }
    });
    return c.json({ ok: true });
  });
