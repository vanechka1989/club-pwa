import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { adminMailingRecipients, appNotifications } from "../db/schema";
import { recordMailingTrackingEvent } from "./trackingEvents";

export async function recordUnreadMailingNotificationsOpened(userId: string, notificationIds?: string[]) {
  const notifications = await db.query.appNotifications.findMany({
    where: and(
      eq(appNotifications.userId, userId),
      eq(appNotifications.source, "mailing"),
      isNotNull(appNotifications.sourceId),
      isNull(appNotifications.readAt),
      ...(notificationIds?.length ? [inArray(appNotifications.id, notificationIds)] : [])
    )
  });
  const mailingIds = [...new Set(notifications.flatMap((item) => item.sourceId ? [item.sourceId] : []))];
  if (!mailingIds.length) return 0;

  const recipients = await db.query.adminMailingRecipients.findMany({
    where: and(
      eq(adminMailingRecipients.userId, userId),
      eq(adminMailingRecipients.channel, "push"),
      inArray(adminMailingRecipients.mailingId, mailingIds)
    )
  });
  await Promise.all(recipients.map((recipient) => recordMailingTrackingEvent({
    recipientId: recipient.id,
    purpose: "open"
  })));
  return recipients.length;
}
