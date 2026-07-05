import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client";
import { appNotifications } from "../db/schema";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { serializeAppNotification } from "../notifications/serialize";

export const notificationsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await db.query.appNotifications.findMany({
      where: eq(appNotifications.userId, userId),
      orderBy: [desc(appNotifications.createdAt)],
      limit: 50
    });
    const [unreadRow] = await db
      .select({ value: count(appNotifications.id) })
      .from(appNotifications)
      .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt)));

    return c.json({
      notifications: await Promise.all(rows.map(serializeAppNotification)),
      unreadCount: unreadRow?.value ?? 0
    });
  })
  .post("/read", async (c) => {
    const userId = c.get("userId");
    await db
      .update(appNotifications)
      .set({ readAt: new Date() })
      .where(eq(appNotifications.userId, userId));

    return c.json({ ok: true, unreadCount: 0 });
  })
  .delete("/", async (c) => {
    const userId = c.get("userId");
    await db.delete(appNotifications).where(eq(appNotifications.userId, userId));

    return c.json({ ok: true, unreadCount: 0 });
  })
  .post("/:id/read", async (c) => {
    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid notification id" }, 400);
    }

    const userId = c.get("userId");
    await db
      .update(appNotifications)
      .set({ readAt: new Date() })
      .where(and(eq(appNotifications.id, idResult.data), eq(appNotifications.userId, userId)));
    const [unreadRow] = await db
      .select({ value: count(appNotifications.id) })
      .from(appNotifications)
      .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt)));

    return c.json({
      ok: true,
      unreadCount: unreadRow?.value ?? 0
    });
  });
