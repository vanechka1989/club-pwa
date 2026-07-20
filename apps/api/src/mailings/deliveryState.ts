import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { adminMailingRecipients, adminMailings } from "../db/schema";

export async function getMailingDeliveryCounts(mailingId: string) {
  const [row] = await db
    .select({
      deliveryCount: sql<number>`count(*)::integer`,
      sentCount: sql<number>`count(*) FILTER (WHERE ${adminMailingRecipients.status} = 'sent')::integer`,
      failedCount: sql<number>`count(*) FILTER (WHERE ${adminMailingRecipients.status} = 'failed')::integer`,
      skippedCount: sql<number>`count(*) FILTER (WHERE ${adminMailingRecipients.status} LIKE 'skipped_%')::integer`,
      pendingCount: sql<number>`count(*) FILTER (WHERE ${adminMailingRecipients.status} = 'pending')::integer`,
      processingCount: sql<number>`count(*) FILTER (WHERE ${adminMailingRecipients.status} = 'processing')::integer`
    })
    .from(adminMailingRecipients)
    .where(eq(adminMailingRecipients.mailingId, mailingId));

  return {
    deliveryCount: Number(row?.deliveryCount ?? 0),
    sentCount: Number(row?.sentCount ?? 0),
    failedCount: Number(row?.failedCount ?? 0),
    skippedCount: Number(row?.skippedCount ?? 0),
    pendingCount: Number(row?.pendingCount ?? 0),
    processingCount: Number(row?.processingCount ?? 0)
  };
}

export async function recalculateMailingDeliveryState(mailingId: string, now = new Date(), deferredUntil: Date | null = null) {
  const counts = await getMailingDeliveryCounts(mailingId);
  const hasOutstandingDeliveries = counts.pendingCount + counts.processingCount > 0;

  await db
    .update(adminMailings)
    .set({
      deliveryCount: counts.deliveryCount,
      sentCount: counts.sentCount,
      failedCount: counts.failedCount,
      skippedCount: counts.skippedCount,
      status: deferredUntil ? "scheduled" : hasOutstandingDeliveries ? "running" : "completed",
      ...(deferredUntil ? { scheduledAt: deferredUntil, completedAt: null } : {}),
      ...(deferredUntil || hasOutstandingDeliveries ? { completedAt: null } : { completedAt: now }),
      updatedAt: now
    })
    .where(eq(adminMailings.id, mailingId));

  return counts;
}
