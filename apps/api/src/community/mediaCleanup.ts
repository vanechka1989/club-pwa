import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { clubMessageAttachments } from "../db/schema";
import { logger } from "../logger";
import { deleteObject } from "../storage/s3";

export const communityMediaCleanupIntervalMs = 10 * 60 * 1000;

export async function cleanupExpiredCommunityMedia(now = new Date()) {
  const attachments = await db.query.clubMessageAttachments.findMany({ where: and(lte(clubMessageAttachments.expiresAt, now), isNull(clubMessageAttachments.deletedAt)) });
  let cleaned = 0;
  for (const attachment of attachments) {
    try {
      await deleteObject(attachment.objectKey);
      await db.update(clubMessageAttachments).set({ deletedAt: now }).where(eq(clubMessageAttachments.id, attachment.id));
      cleaned += 1;
    } catch (error) {
      logger.warn({ error, attachmentId: attachment.id }, "community media cleanup failed");
    }
  }
  return cleaned;
}

export function startCommunityMediaCleanupJob() {
  const run = () => void cleanupExpiredCommunityMedia().catch((error) => logger.warn({ error }, "community media cleanup job failed"));
  run();
  return setInterval(run, communityMediaCleanupIntervalMs);
}
