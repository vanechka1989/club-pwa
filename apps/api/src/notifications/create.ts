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
  deduplicate?: boolean;
};

export async function createAppNotification(
  input: CreateAppNotificationInput,
  options: CreateAppNotificationOptions = {}
) {
  const insert = db
    .insert(appNotifications)
    .values({
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
    });
  const [notification] = options.deduplicate
    ? await insert.onConflictDoNothing().returning()
    : await insert.returning();

  if (notification) {
    const delivery = sendWebPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: input.pushUrl ?? "/"
    });
    if (options.waitForPush) {
      const result = await delivery;
      return { notification, pushDelivered: Boolean(result?.sent) };
    } else {
      void delivery.catch((error) => {
        logger.warn({ error, userId: input.userId }, "app notification push failed");
      });
    }
  }

  return { notification: notification ?? null, pushDelivered: false };
}
