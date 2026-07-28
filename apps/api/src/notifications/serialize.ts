import type { AppNotification } from "@club/shared";
import { appNotifications } from "../db/schema";
import { getObjectReadUrl } from "../storage/s3";

function safeNotificationBody(notification: typeof appNotifications.$inferSelect) {
  if (notification.source === "community_reply") return "Откройте чат, чтобы посмотреть ответ.";
  if (notification.source === "community_mention") return "Откройте чат, чтобы посмотреть упоминание.";
  if (notification.source === "community_all") return "Откройте чат, чтобы посмотреть новое сообщение.";
  return notification.body;
}

export async function serializeAppNotification(
  notification: typeof appNotifications.$inferSelect
): Promise<AppNotification> {
  return {
    id: notification.id,
    kind: notification.kind as AppNotification["kind"],
    title: notification.title,
    body: safeNotificationBody(notification),
    bodyHtml: notification.source?.startsWith("community_") ? null : notification.bodyHtml,
    source: notification.source,
    sourceId: notification.sourceId,
    attachment:
      notification.attachmentKind &&
      notification.attachmentFileName &&
      notification.attachmentObjectKey &&
      notification.attachmentContentType
        ? {
            kind: notification.attachmentKind as "photo" | "video" | "document",
            fileName: notification.attachmentFileName,
            url: await getObjectReadUrl(notification.attachmentObjectKey),
            contentType: notification.attachmentContentType,
            sizeBytes: notification.attachmentSizeBytes ?? 0
          }
        : null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString()
  };
}
