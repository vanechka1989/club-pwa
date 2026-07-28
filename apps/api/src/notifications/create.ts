import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { appNotifications } from "../db/schema";
import { logger } from "../logger";
import { sendWebPushToUser } from "../push/webPush";

export type CreateAppNotificationInput = {
  userId: string;
  kind?: "system" | "support" | "payment" | "client" | "mailing";
  title: string;
  body: string;
  bodyHtml?: string | null;
  source?: string | null;
  sourceId?: string | null;
  deduplicate?: boolean;
  pushUrl?: string;
  attachment?: {
    kind: "photo" | "video" | "document";
    fileName: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  } | null;
};

type CreateAppNotificationOptions = {
  waitForPush?: boolean;
};

export async function createAppNotification(
  input: CreateAppNotificationInput,
  options: CreateAppNotificationOptions = {}
) {
  const values = {
    userId: input.userId,
    kind: input.kind ?? "system",
    title: input.title,
    body: input.body,
    bodyHtml: input.bodyHtml ?? null,
    source: input.source ?? null,
    sourceId: input.sourceId ?? null,
    attachmentKind: input.attachment?.kind ?? null,
    attachmentFileName: input.attachment?.fileName ?? null,
    attachmentObjectKey: input.attachment?.objectKey ?? null,
    attachmentContentType: input.attachment?.contentType ?? null,
    attachmentSizeBytes: input.attachment?.sizeBytes ?? null
  };

  const insertNotification = async (database: typeof db) => {
    const [notification] = await database.insert(appNotifications).values(values).returning();
    return notification ?? null;
  };

  const persisted = input.deduplicate && input.source && input.sourceId
    ? await db.transaction(async (transaction) => {
        const database = transaction as unknown as typeof db;
        const deduplicationKey = `${input.userId}:${input.source}:${input.sourceId}`;
        await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${deduplicationKey}, 0))`);
        const existing = await database.query.appNotifications.findFirst({
          where: and(
            eq(appNotifications.userId, input.userId),
            eq(appNotifications.source, input.source!),
            eq(appNotifications.sourceId, input.sourceId!)
          )
        });
        if (existing) return { notification: existing, created: false };
        return { notification: await insertNotification(database), created: true };
      })
    : { notification: await insertNotification(db), created: true };

  const { notification } = persisted;

  if (notification && persisted.created) {
    const delivery = sendWebPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: input.pushUrl ?? "/"
    });
    if (options.waitForPush) {
      await delivery;
    } else {
      void delivery.catch((error) => {
        logger.warn({ error, userId: input.userId }, "app notification push failed");
      });
    }
  }

  return notification ?? null;
}
