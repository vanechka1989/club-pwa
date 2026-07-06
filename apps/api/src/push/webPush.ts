import webpush from "web-push";
import { eq, isNull, and } from "drizzle-orm";

export type NormalizedPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
};

export function normalizePushSubscription(value: unknown): NormalizedPushSubscription | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof source.endpoint === "string" ? source.endpoint.trim() : "";
  const p256dh = typeof source.keys?.p256dh === "string" ? source.keys.p256dh.trim() : "";
  const auth = typeof source.keys?.auth === "string" ? source.keys.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return { endpoint, p256dh, auth };
}

export function buildWebPushPayload(input: WebPushPayload): WebPushPayload {
  return {
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 240),
    url: input.url || "/"
  };
}

type WebPushConfig = {
  WEB_PUSH_PUBLIC_KEY?: string | undefined;
  WEB_PUSH_PRIVATE_KEY?: string | undefined;
  WEB_PUSH_SUBJECT?: string | undefined;
};

export function isWebPushConfigured(config: WebPushConfig = process.env as WebPushConfig) {
  return Boolean(config.WEB_PUSH_PUBLIC_KEY && config.WEB_PUSH_PRIVATE_KEY);
}

function configureWebPush(config: WebPushConfig) {
  if (!isWebPushConfigured(config)) {
    return false;
  }

  webpush.setVapidDetails(config.WEB_PUSH_SUBJECT ?? "mailto:admin@example.com", config.WEB_PUSH_PUBLIC_KEY!, config.WEB_PUSH_PRIVATE_KEY!);
  return true;
}

export async function sendWebPushToUser(userId: string, payload: WebPushPayload) {
  const [{ env }, { db }, { pushSubscriptions }, { logger }] = await Promise.all([
    import("../env"),
    import("../db/client"),
    import("../db/schema"),
    import("../logger")
  ]);

  if (!configureWebPush(env)) {
    return { sent: 0, skipped: true };
  }

  const rows = await db.query.pushSubscriptions.findMany({
    where: and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt))
  });
  let sent = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh,
              auth: row.auth
            }
          },
          JSON.stringify(buildWebPushPayload(payload))
        );
        sent += 1;
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
            ? error.statusCode
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .update(pushSubscriptions)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(pushSubscriptions.id, row.id));
          return;
        }

        logger.warn({ error, userId, subscriptionId: row.id }, "web push delivery failed");
      }
    })
  );

  return { sent, skipped: false };
}
