import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { pushSubscriptions } from "../db/schema";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { env } from "../env";
import { normalizePushSubscription } from "../push/webPush";

export const pushRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/vapid-public-key", (c) =>
    c.json({
      publicKey: env.WEB_PUSH_PUBLIC_KEY ?? null
    })
  )
  .post("/subscriptions", async (c) => {
    const subscription = normalizePushSubscription(await c.req.json().catch(() => null));
    if (!subscription) {
      return c.json({ error: "Invalid push subscription" }, 400);
    }

    const now = new Date();
    const [saved] = await db
      .insert(pushSubscriptions)
      .values({
        userId: c.get("userId"),
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        userAgent: c.req.header("user-agent") ?? null
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: c.get("userId"),
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          userAgent: c.req.header("user-agent") ?? null,
          revokedAt: null,
          updatedAt: now
        }
      })
      .returning();

    return c.json({ ok: Boolean(saved) });
  })
  .delete("/subscriptions", async (c) => {
    const subscription = normalizePushSubscription(await c.req.json().catch(() => null));
    if (!subscription) {
      return c.json({ error: "Invalid push subscription" }, 400);
    }

    await db
      .update(pushSubscriptions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pushSubscriptions.endpoint, subscription.endpoint), eq(pushSubscriptions.userId, c.get("userId"))));

    return c.json({ ok: true });
  });
