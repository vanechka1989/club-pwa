import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  appNotifications,
  clubChatMessages,
  clubMessageAttachments,
  clubMessageMentions,
  clubPolls
} from "../db/schema";
import { logger } from "../logger";
import { deleteObjectCopies } from "../storage/s3";

export const deletedMessageCleanupBatchSize = 100;
export const deletedMessageCleanupIntervalMs = 60 * 60 * 1000;
export const deletedMessageCleanupClaimStaleMs = 6 * 60 * 60 * 1000;

export type DeletedMessageCleanupCandidate = {
  id: string;
  claimId: string;
  attachments: Array<{ id: string; objectKey: string }>;
};

export interface DeletedMessageCleanupRepository {
  claimBatch(input: { limit: number }): Promise<DeletedMessageCleanupCandidate[]>;
  finalize(candidate: DeletedMessageCleanupCandidate): Promise<boolean>;
  release(candidate: DeletedMessageCleanupCandidate): Promise<void>;
}

type DeletedMessageCleanupDependencies = {
  repository: DeletedMessageCleanupRepository;
  deleteObjectCopies: (key: string) => Promise<unknown>;
  logger: Pick<typeof logger, "info" | "warn">;
};

export function createDeletedMessageCleanup(dependencies: DeletedMessageCleanupDependencies) {
  return async function cleanupDeletedMessages() {
    const purgedMessageIds: string[] = [];
    const failedMessageIds: string[] = [];
    const candidates = await dependencies.repository.claimBatch({ limit: deletedMessageCleanupBatchSize });

    for (const candidate of candidates) {
      try {
        await Promise.all(candidate.attachments.map((attachment) =>
          dependencies.deleteObjectCopies(attachment.objectKey)));
        if (!(await dependencies.repository.finalize(candidate))) {
          throw new Error("Deleted message cleanup claim was lost before finalization");
        }
        purgedMessageIds.push(candidate.id);
      } catch (error) {
        failedMessageIds.push(candidate.id);
        await dependencies.repository.release(candidate).catch((releaseError) => {
          dependencies.logger.warn(
            { error: releaseError, messageId: candidate.id },
            "deleted community message cleanup claim release failed"
          );
        });
        dependencies.logger.warn(
          { error, messageId: candidate.id },
          "deleted community message purge failed"
        );
      }
    }

    if (purgedMessageIds.length) {
      dependencies.logger.info(
        { purgedMessageIds, count: purgedMessageIds.length },
        "deleted community messages purged"
      );
    }
    return { purgedMessageIds, failedMessageIds };
  };
}

export function createDeletedMessageCleanupRepository(database: typeof db = db): DeletedMessageCleanupRepository {
  return {
    async claimBatch({ limit }) {
      const claimedRows = Array.from((await database.execute(sql`
        with candidates as (
          select id
          from club_chat_messages
          where deleted_by_user_at is not null
            and deleted_content_expires_at is not null
            and deleted_content_expires_at <= clock_timestamp()
            and (
              deleted_cleanup_claimed_at is null
              or deleted_cleanup_claimed_at <= clock_timestamp() - (${deletedMessageCleanupClaimStaleMs} * interval '1 millisecond')
            )
          order by deleted_content_expires_at, id
          limit ${limit}
          for update skip locked
        )
        update club_chat_messages message
        set deleted_cleanup_claim_id = gen_random_uuid(),
            deleted_cleanup_claimed_at = clock_timestamp()
        from candidates
        where message.id = candidates.id
        returning message.id, message.deleted_cleanup_claim_id as "claimId"
      `)) as Iterable<{ id: string; claimId: string }>);
      if (!claimedRows.length) return [];
      const messageIds = claimedRows.map((row) => row.id);
      const attachments = await database.query.clubMessageAttachments.findMany({
        where: inArray(clubMessageAttachments.messageId, messageIds)
      });
      return claimedRows.map((row) => ({
        id: row.id,
        claimId: row.claimId,
        attachments: attachments
          .filter((attachment) => attachment.messageId === row.id && !attachment.deletedAt)
          .map((attachment) => ({ id: attachment.id, objectKey: attachment.objectKey }))
      }));
    },
    async finalize(candidate) {
      return database.transaction(async (transaction) => {
        const claimedRows = Array.from((await transaction.execute(sql`
          select id
          from club_chat_messages
          where id = ${candidate.id}
            and deleted_cleanup_claim_id = ${candidate.claimId}
            and deleted_content_expires_at is not null
            and deleted_content_expires_at <= clock_timestamp()
          for update
        `)) as Iterable<{ id: string }>);
        if (!claimedRows.length) return false;

        await transaction.delete(clubMessageMentions).where(eq(clubMessageMentions.messageId, candidate.id));
        await transaction.delete(clubPolls).where(eq(clubPolls.messageId, candidate.id));
        await transaction.delete(appNotifications).where(and(
          eq(appNotifications.sourceId, candidate.id),
          inArray(appNotifications.source, ["community_reply", "community_mention", "community_all"])
        ));
        await transaction
          .update(clubMessageAttachments)
          .set({ scanStatus: "deleted", deletedAt: sql`clock_timestamp()` })
          .where(eq(clubMessageAttachments.messageId, candidate.id));
        const [finalized] = await transaction
          .update(clubChatMessages)
          .set({
            body: "",
            deletedContentExpiresAt: null,
            deletedCleanupClaimId: null,
            deletedCleanupClaimedAt: null,
            updatedAt: sql`clock_timestamp()`
          })
          .where(and(
            eq(clubChatMessages.id, candidate.id),
            eq(clubChatMessages.deletedCleanupClaimId, candidate.claimId)
          ))
          .returning({ id: clubChatMessages.id });
        return Boolean(finalized);
      });
    },
    async release(candidate) {
      await database
        .update(clubChatMessages)
        .set({ deletedCleanupClaimId: null, deletedCleanupClaimedAt: null })
        .where(and(
          eq(clubChatMessages.id, candidate.id),
          eq(clubChatMessages.deletedCleanupClaimId, candidate.claimId)
        ));
    }
  };
}

export const deletedMessageCleanupRepository = createDeletedMessageCleanupRepository();

export const cleanupDeletedMessages = createDeletedMessageCleanup({
  repository: deletedMessageCleanupRepository,
  deleteObjectCopies,
  logger
});

type DeletedMessageCleanupJobDependencies = {
  cleanup: () => Promise<unknown>;
  setInterval: (run: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
  logger: Pick<typeof logger, "warn">;
};

export function createDeletedMessageCleanupJob(dependencies: DeletedMessageCleanupJobDependencies) {
  let activeRun: Promise<void> | null = null;
  let stopped = false;

  const run = () => {
    if (stopped || activeRun) return activeRun;
    activeRun = Promise.resolve(dependencies.cleanup())
      .then(() => undefined)
      .catch((error) => dependencies.logger.warn({ error }, "deleted community message cleanup job failed"))
      .finally(() => {
        activeRun = null;
      });
    return activeRun;
  };

  const timer = dependencies.setInterval(() => void run(), deletedMessageCleanupIntervalMs);
  void run();
  return {
    timer,
    async stop() {
      stopped = true;
      dependencies.clearInterval(timer);
      await activeRun;
    }
  };
}

export function startDeletedMessageCleanupJob() {
  return createDeletedMessageCleanupJob({
    cleanup: cleanupDeletedMessages,
    setInterval,
    clearInterval,
    logger
  });
}
