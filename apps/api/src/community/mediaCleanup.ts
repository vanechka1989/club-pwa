import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { clubMessageAttachments } from "../db/schema";
import { logger } from "../logger";
import { deleteObjectCopies } from "../storage/s3";

export const communityMediaCleanupIntervalMs = 10 * 60 * 1000;

type ExpiredCommunityAttachment = Pick<
  typeof clubMessageAttachments.$inferSelect,
  "id" | "objectKey"
>;

export interface CommunityMediaCleanupRepository {
  listExpired(now: Date): Promise<ExpiredCommunityAttachment[]>;
  markDeleted(id: string, deletedAt: Date): Promise<void>;
}

type CommunityMediaCleanupDependencies = {
  repository: CommunityMediaCleanupRepository;
  deleteObjectCopies: (key: string) => Promise<unknown>;
  logger: Pick<typeof logger, "warn">;
};

export function createCommunityMediaCleanup(dependencies: CommunityMediaCleanupDependencies) {
  return async function cleanupExpiredCommunityMedia(now = new Date()) {
    const attachments = await dependencies.repository.listExpired(now);
    let cleaned = 0;
    for (const attachment of attachments) {
      try {
        await dependencies.deleteObjectCopies(attachment.objectKey);
        await dependencies.repository.markDeleted(attachment.id, now);
        cleaned += 1;
      } catch (error) {
        dependencies.logger.warn({ error, attachmentId: attachment.id }, "community media cleanup failed");
      }
    }
    return cleaned;
  };
}

export const communityMediaCleanupRepository: CommunityMediaCleanupRepository = {
  listExpired: (now) => db.query.clubMessageAttachments.findMany({
    where: and(
      lte(clubMessageAttachments.expiresAt, now),
      isNull(clubMessageAttachments.deletedAt)
    )
  }),
  async markDeleted(id, deletedAt) {
    await db
      .update(clubMessageAttachments)
      .set({ deletedAt })
      .where(eq(clubMessageAttachments.id, id));
  }
};

export const cleanupExpiredCommunityMedia = createCommunityMediaCleanup({
  repository: communityMediaCleanupRepository,
  deleteObjectCopies,
  logger
});

export function startCommunityMediaCleanupJob() {
  const run = () => void cleanupExpiredCommunityMedia().catch((error) =>
    logger.warn({ error }, "community media cleanup job failed"));
  run();
  return setInterval(run, communityMediaCleanupIntervalMs);
}
