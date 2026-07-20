import { db } from "../db/client";
import { appNotifications } from "../db/schema";
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

export async function createAppNotification(input: CreateAppNotificationInput) {
  const [notification] = await db
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
    })
    .returning();

  if (notification) {
    void sendWebPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: input.pushUrl ?? "/"
    });
  }

  return notification ?? null;
}
