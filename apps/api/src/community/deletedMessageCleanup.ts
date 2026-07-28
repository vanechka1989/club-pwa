import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  clubChatMessages,
  clubMessageAttachments,
  clubMessageMentions,
  clubPolls
} from "../db/schema";
import { logger } from "../logger";
import { deleteObject } from "../storage/s3";

export const deletedMessageCleanupBatchSize = 100;
export const deletedMessageCleanupIntervalMs = 60 * 60 * 1000;

type CleanupCandidate = {
  id: string;
  attachments: Array<{ id: string; objectKey: string }>;
};

type PurgeContent = (messageId: string, attachmentIds: string[], purgedAt: Date) => Promise<void>;

export interface DeletedMessageCleanupRepository {
  runLockedBatch<T>(input: {
    now: Date;
    limit: number;
    purge: (candidates: CleanupCandidate[], purgeContent: PurgeContent) => Promise<T>;
  }): Promise<T>;
}

type DeletedMessageCleanupDependencies = {
  repository: DeletedMessageCleanupRepository;
  deleteObject: (key: string) => Promise<unknown>;
  logger: Pick<typeof logger, "info" | "warn">;
};

export function createDeletedMessageCleanup(dependencies: DeletedMessageCleanupDependencies) {
  return async function cleanupDeletedMessages(now = new Date()) {
    const purgedMessageIds: string[] = [];
    const failedMessageIds: string[] = [];

    await dependencies.repository.runLockedBatch({
      now,
      limit: deletedMessageCleanupBatchSize,
      purge: async (candidates, purgeContent) => {
        for (const candidate of candidates) {
          try {
            for (const attachment of candidate.attachments) {
              await dependencies.deleteObject(attachment.objectKey);
            }
            await purgeContent(
              candidate.id,
              candidate.attachments.map((attachment) => attachment.id),
              now
            );
            purgedMessageIds.push(candidate.id);
          } catch (error) {
            failedMessageIds.push(candidate.id);
            dependencies.logger.warn(
              { error, messageId: candidate.id },
              "deleted community message purge failed"
            );
          }
        }
      }
    });

    if (purgedMessageIds.length) {
      dependencies.logger.info(
        { purgedMessageIds, count: purgedMessageIds.length },
        "deleted community messages purged"
      );
    }
    return { purgedMessageIds, failedMessageIds };
  };
}

const deletedMessageCleanupRepository: DeletedMessageCleanupRepository = {
  async runLockedBatch({ now, limit, purge }) {
    return db.transaction(async (transaction) => {
      const rows = Array.from((await transaction.execute(sql`
        select id
        from club_chat_messages
        where deleted_by_user_at is not null
          and deleted_content_expires_at is not null
          and deleted_content_expires_at <= ${now}
        order by deleted_content_expires_at, id
        limit ${limit}
        for update skip locked
      `)) as Iterable<{ id: string }>);
      const messageIds = rows.map((row) => row.id);
      const purgeContent: PurgeContent = async (messageId, attachmentIds, purgedAt) => {
        await transaction.delete(clubMessageMentions).where(eq(clubMessageMentions.messageId, messageId));
        await transaction.delete(clubPolls).where(eq(clubPolls.messageId, messageId));
        if (attachmentIds.length) {
          await transaction
            .update(clubMessageAttachments)
            .set({ scanStatus: "deleted", deletedAt: purgedAt })
            .where(inArray(clubMessageAttachments.id, attachmentIds));
        }
        await transaction
          .update(clubChatMessages)
          .set({ body: "", deletedContentExpiresAt: null, updatedAt: purgedAt })
          .where(and(
            eq(clubChatMessages.id, messageId),
            lte(clubChatMessages.deletedContentExpiresAt, purgedAt)
          ));
      };
      if (!messageIds.length) return purge([], purgeContent);
      const attachments = await transaction.query.clubMessageAttachments.findMany({
        where: and(
          inArray(clubMessageAttachments.messageId, messageIds),
          isNull(clubMessageAttachments.deletedAt)
        )
      });
      return purge(messageIds.map((id) => ({
        id,
        attachments: attachments
          .filter((attachment) => attachment.messageId === id)
          .map((attachment) => ({ id: attachment.id, objectKey: attachment.objectKey }))
      })), purgeContent);
    });
  }
};

export const cleanupDeletedMessages = createDeletedMessageCleanup({
  repository: deletedMessageCleanupRepository,
  deleteObject,
  logger
});

export function startDeletedMessageCleanupJob() {
  const run = () => void cleanupDeletedMessages().catch((error) =>
    logger.warn({ error }, "deleted community message cleanup job failed"));
  run();
  return setInterval(run, deletedMessageCleanupIntervalMs);
}
