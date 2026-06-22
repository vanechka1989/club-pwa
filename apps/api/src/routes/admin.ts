import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AdminStatsUser, MembershipStatus } from "@club/shared";
import { getUserRole, isOwnerTelegramId } from "../admin/roles";
import { db } from "../db/client";
import { adminUsers, contentItems, subscriptions, userContentProgress, users } from "../db/schema";
import { env } from "../env";
import { getMembership } from "../membership/getMembership";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";

const adminPayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/)
});

const accessPayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/),
  status: z.enum(["inactive", "active", "expired"]),
  expiresAt: z.string().datetime().nullable().optional()
});

async function getPublishedItemsCount() {
  const [row] = await db
    .select({
      value: count(contentItems.id)
    })
    .from(contentItems)
    .where(eq(contentItems.isPublished, true));

  return row?.value ?? 0;
}

async function buildStatsUser(user: typeof users.$inferSelect, totalItems: number): Promise<AdminStatsUser> {
  const membership = await getMembership(user.id);
  const [completedRow] = await db
    .select({
      value: count(userContentProgress.id)
    })
    .from(userContentProgress)
    .where(and(eq(userContentProgress.userId, user.id), isNotNull(userContentProgress.completedAt)));

  const lastOpened = await db.query.userContentProgress.findFirst({
    where: eq(userContentProgress.userId, user.id),
    orderBy: [desc(userContentProgress.lastOpenedAt)],
    with: {
      item: true
    }
  });

  return {
    id: user.id,
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
    membershipStatus: membership.status,
    membershipExpiresAt: membership.subscription?.expiresAt?.toISOString() ?? null,
    completedItems: completedRow?.value ?? 0,
    totalItems,
    lastOpenedItemTitle: lastOpened?.item?.title ?? null,
    lastOpenedAt: lastOpened?.lastOpenedAt.toISOString() ?? null
  };
}

async function findOrCreateUserByTelegramId(telegramId: string) {
  const [createdUser] = await db
    .insert(users)
    .values({
      telegramId,
      firstName: null,
      username: null
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        updatedAt: new Date()
      }
    })
    .returning();

  return (
    createdUser ??
    (await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId)
    }))
  );
}

export const adminRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .use("*", async (c, next) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Admin access required" }, 403);
    }

    await next();
  })
  .get("/admins", async (c) => {
    const admins = await db.query.adminUsers.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)]
    });

    return c.json({
      ownerTelegramId: env.OWNER_TELEGRAM_ID,
      admins: admins.map((admin) => ({
        id: admin.id,
        telegramId: admin.telegramId,
        createdAt: admin.createdAt.toISOString()
      }))
    });
  })
  .get("/stats", async (c) => {
    const totalItems = await getPublishedItemsCount();
    const recentUsers = await db.query.users.findMany({
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit: 50
    });
    const statsUsers = await Promise.all(recentUsers.map((user) => buildStatsUser(user, totalItems)));

    return c.json({
      totalUsers: statsUsers.length,
      activeUsers: statsUsers.filter((user) => user.membershipStatus === "active").length,
      completedItems: statsUsers.reduce((sum, user) => sum + user.completedItems, 0),
      totalItems,
      users: statsUsers
    });
  })
  .get("/stats/users/:telegramId", async (c) => {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, c.req.param("telegramId"))
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(await buildStatsUser(user, await getPublishedItemsCount()));
  })
  .post("/access", async (c) => {
    const body = accessPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid access payload" }, 400);
    }

    const user = await findOrCreateUserByTelegramId(body.data.telegramId);
    if (!user) {
      return c.json({ error: "Unable to resolve user" }, 500);
    }

    const now = new Date();
    const expiresAt =
      body.data.status === "active"
        ? body.data.expiresAt
          ? new Date(body.data.expiresAt)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : body.data.expiresAt
          ? new Date(body.data.expiresAt)
          : now;

    await db.insert(subscriptions).values({
      userId: user.id,
      status: body.data.status as MembershipStatus,
      provider: "manual",
      providerPaymentId: `admin:${c.get("userId")}:${now.toISOString()}`,
      expiresAt,
      createdAt: now,
      updatedAt: now
    });

    return c.json({
      ok: true,
      user: await buildStatsUser(user, await getPublishedItemsCount())
    });
  })
  .post("/admins", async (c) => {
    if (!isOwnerTelegramId(c.get("telegramUser").id)) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const body = adminPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Telegram ID must contain only digits" }, 400);
    }

    if (body.data.telegramId === env.OWNER_TELEGRAM_ID) {
      return c.json({ ok: true });
    }

    await db
      .insert(adminUsers)
      .values({
        telegramId: body.data.telegramId,
        createdByUserId: c.get("userId")
      })
      .onConflictDoNothing({
        target: adminUsers.telegramId
      });

    return c.json({ ok: true });
  })
  .delete("/admins/:telegramId", async (c) => {
    if (!isOwnerTelegramId(c.get("telegramUser").id)) {
      return c.json({ error: "Owner access required" }, 403);
    }

    const telegramId = c.req.param("telegramId");
    if (telegramId === env.OWNER_TELEGRAM_ID) {
      return c.json({ error: "Owner cannot be removed" }, 400);
    }

    await db.delete(adminUsers).where(eq(adminUsers.telegramId, telegramId));

    return c.json({ ok: true });
  });
