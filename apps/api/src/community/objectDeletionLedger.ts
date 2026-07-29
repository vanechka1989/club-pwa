import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  appNotifications,
  clubChatMessages,
  clubMessageAttachments,
  clubMessageMentions,
  clubPolls,
  communityObjectDeletionEntries,
  communityObjectDeletionJobs,
  communityUploadManifests
} from "../db/schema";
import { logger } from "../logger";
import {
  deleteCommunityObjectCopiesConvergently,
  deleteCommunityObjectKeysConvergently,
  runCommunityObjectTombstoneSweepBatch,
  tombstoneCommunityObjectKeysInDatabase,
  type CommunityObjectStorageTarget
} from "./objectLifecycle";
import { recoverStaleAttachmentPublications } from "./attachmentPublicationRecovery";

export const communityObjectDeletionBatchSize = 100;
export const communityObjectDeletionIntervalMs = 60_000;
export const communityObjectDeletionClaimStaleMs = 15 * 60_000;

export type CommunityObjectDeletionAction =
  | "objects_only"
  | "redact_message"
  | "delete_message"
  | "delete_attachment"
  | "delete_manifest";

export type CommunityObjectDeletionCandidate = {
  id: string;
  claimId: string;
  sourceType: string;
  sourceId: string;
  action: CommunityObjectDeletionAction;
  expectedLifecycleVersion: number | null;
  objectKeys: string[];
};

export interface CommunityObjectDeletionRepository {
  enqueueDue(input: { limit: number }): Promise<void>;
  claimBatch(input: { limit: number }): Promise<CommunityObjectDeletionCandidate[]>;
  quiescePublishers(candidate: CommunityObjectDeletionCandidate): Promise<boolean>;
  finalize(candidate: CommunityObjectDeletionCandidate): Promise<boolean>;
  release(candidate: CommunityObjectDeletionCandidate, error: string): Promise<void>;
}

type CleanupDependencies = {
  repository: CommunityObjectDeletionRepository;
  deleteObjectCopies: (key: string) => Promise<unknown>;
  deleteObjectKeys?: (keys: string[]) => Promise<unknown>;
  logger: Pick<typeof logger, "info" | "warn">;
};

function cleanupError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export function createCommunityObjectDeletionCleanup(dependencies: CleanupDependencies) {
  return async function cleanupCommunityObjects() {
    await dependencies.repository.enqueueDue({ limit: communityObjectDeletionBatchSize });
    const jobs = await dependencies.repository.claimBatch({ limit: communityObjectDeletionBatchSize });
    const completedJobIds: string[] = [];
    const deferredJobIds: string[] = [];
    const failedJobIds: string[] = [];

    for (const job of jobs) {
      try {
        if (!(await dependencies.repository.quiescePublishers(job))) {
          deferredJobIds.push(job.id);
          continue;
        }
        if (dependencies.deleteObjectKeys) await dependencies.deleteObjectKeys(job.objectKeys);
        else for (const key of job.objectKeys) await dependencies.deleteObjectCopies(key);
        if (!(await dependencies.repository.finalize(job))) {
          throw new Error("Community object cleanup fencing claim was lost");
        }
        completedJobIds.push(job.id);
      } catch (error) {
        failedJobIds.push(job.id);
        const message = cleanupError(error);
        await dependencies.repository.release(job, message).catch((releaseError) => {
          dependencies.logger.warn({ error: releaseError, cleanupJobId: job.id }, "community object cleanup release failed");
        });
        dependencies.logger.warn({ error, cleanupJobId: job.id }, "community object cleanup failed");
      }
    }

    if (completedJobIds.length) {
      dependencies.logger.info({ completedJobIds, count: completedJobIds.length }, "community object cleanup completed");
    }
    return { completedJobIds, deferredJobIds, failedJobIds };
  };
}

type CleanupDatabase = typeof db;

async function enqueueDueWithDatabase(database: CleanupDatabase, limit: number) {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), communityObjectDeletionBatchSize);
  await database.transaction(async (transaction) => {
    const purgeRequests = Array.from((await transaction.execute(sql`
      select id, topic_id as "topicId", user_id as "userId", include_system as "includeSystem"
      from community_message_purge_requests
      order by created_at, id
      limit 1
      for update skip locked
    `)) as Iterable<{ id: string; topicId: string; userId: string | null; includeSystem: boolean }>);
    const purgeRequest = purgeRequests[0];
    let requestedRows: Array<{ id: string }> = [];
    if (purgeRequest) {
      requestedRows = Array.from((await transaction.execute(sql`
        with candidates as materialized (
          select message.id
          from club_chat_messages message
          where message.topic_id = ${purgeRequest.topicId}
            and message.terminal_cleanup_at is null
            ${purgeRequest.userId ? sql`and message.user_id = ${purgeRequest.userId}` : sql``}
            ${purgeRequest.includeSystem ? sql`` : sql`and message.is_system = false`}
          order by message.created_at, message.id
          limit ${boundedLimit}
          for update skip locked
        )
        select id, community_enqueue_message_cleanup(id, 'delete_message') as job_id
        from candidates
      `)) as Iterable<{ id: string }>);
      if (requestedRows.length < boundedLimit) {
        const remainingRows = Array.from((await transaction.execute(sql`
          select exists (
            select 1
            from club_chat_messages message
            where message.topic_id = ${purgeRequest.topicId}
              and message.terminal_cleanup_at is null
              ${purgeRequest.userId ? sql`and message.user_id = ${purgeRequest.userId}` : sql``}
              ${purgeRequest.includeSystem ? sql`` : sql`and message.is_system = false`}
          ) as "hasRemaining"
        `)) as Iterable<{ hasRemaining: boolean }>);
        if (!remainingRows[0]?.hasRemaining) {
          await transaction.execute(sql`delete from community_message_purge_requests where id = ${purgeRequest.id}`);
        }
      }
    }
    const remainingAfterRequest = boundedLimit - requestedRows.length;
    if (remainingAfterRequest <= 0) return;

    const messageRows = Array.from((await transaction.execute(sql`
      with due as materialized (
        select message.id,
               case when message.status = 'deleted' and message.purge_at <= clock_timestamp()
                    then 'delete_message' else 'redact_message' end as action
        from club_chat_messages message
        where message.terminal_cleanup_at is null
          and (
            (message.status = 'deleted' and message.purge_at is not null and message.purge_at <= clock_timestamp())
            or (
              message.deleted_by_user_at is not null
              and message.deleted_content_expires_at is not null
              and message.deleted_content_expires_at <= clock_timestamp()
            )
          )
        order by coalesce(message.purge_at, message.deleted_content_expires_at), message.id
        limit ${remainingAfterRequest}
        for update skip locked
      )
      select id, community_enqueue_message_cleanup(id, action) as job_id
      from due
    `)) as Iterable<{ id: string }>);
    const remaining = remainingAfterRequest - messageRows.length;
    if (remaining <= 0) return;
    await transaction.execute(sql`
      with due as materialized (
        select attachment.id
        from club_message_attachments attachment
        join club_chat_messages message on message.id = attachment.message_id
        where attachment.deleted_at is null
          and attachment.terminal_cleanup_at is null
          and message.terminal_cleanup_at is null
          and attachment.expires_at is not null
          and attachment.expires_at <= clock_timestamp()
        order by attachment.expires_at, attachment.id
        limit ${remaining}
        for update of attachment skip locked
      )
      select id, community_enqueue_attachment_cleanup(id) as job_id
      from due
    `);
  });
}

async function sourceStillMatches(
  database: CleanupDatabase,
  candidate: CommunityObjectDeletionCandidate
) {
  const tableName = candidate.sourceType === "message"
    ? sql.raw("club_chat_messages")
    : candidate.sourceType === "attachment"
      ? sql.raw("club_message_attachments")
      : candidate.sourceType === "manifest"
        ? sql.raw("community_upload_manifests")
        : null;
  if (!tableName) return true;
  const rows = Array.from((await database.execute(sql`
    select id
    from ${tableName}
    where id = ${candidate.sourceId}
      ${candidate.expectedLifecycleVersion === null
        ? sql``
        : sql`and lifecycle_version = ${candidate.expectedLifecycleVersion} and terminal_cleanup_at is not null`}
    limit 1
  `)) as Iterable<{ id: string }>);
  return rows.length > 0;
}

export function createCommunityObjectDeletionRepository(
  database: CleanupDatabase = db,
  loadTargets: () => Promise<CommunityObjectStorageTarget[]> = async () =>
    (await import("../storage/s3")).getConfiguredS3Targets()
): CommunityObjectDeletionRepository {
  return {
    enqueueDue: ({ limit }) => enqueueDueWithDatabase(database, limit),

    async claimBatch({ limit }) {
      const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), communityObjectDeletionBatchSize);
      const jobs = Array.from((await database.execute(sql`
        with candidates as (
          select id
          from community_object_deletion_jobs
          where not_before <= clock_timestamp()
            and (
              status = 'pending'
              or (status = 'claimed' and claimed_at <= clock_timestamp() - (${communityObjectDeletionClaimStaleMs} * interval '1 millisecond'))
            )
          order by not_before, created_at, id
          limit ${boundedLimit}
          for update skip locked
        )
        update community_object_deletion_jobs job
        set status = 'claimed', claim_id = gen_random_uuid(), claimed_at = clock_timestamp(),
            attempts = attempts + 1, updated_at = clock_timestamp()
        from candidates
        where job.id = candidates.id
        returning job.id, job.claim_id as "claimId", job.source_type as "sourceType",
                  job.source_id as "sourceId", job.action,
                  job.expected_lifecycle_version as "expectedLifecycleVersion"
      `)) as Iterable<Omit<CommunityObjectDeletionCandidate, "objectKeys">>);
      if (!jobs.length) return [];
      const entries = await database
        .select({ jobId: communityObjectDeletionEntries.jobId, objectKey: communityObjectDeletionEntries.objectKey })
        .from(communityObjectDeletionEntries)
        .where(inArray(communityObjectDeletionEntries.jobId, jobs.map((job) => job.id)));
      return jobs.map((job) => ({
        ...job,
        action: job.action as CommunityObjectDeletionAction,
        objectKeys: entries.filter((entry) => entry.jobId === job.id).map((entry) => entry.objectKey).sort()
      }));
    },

    async quiescePublishers(candidate) {
      const targets = await loadTargets();
      return database.transaction(async (transaction) => {
        const databaseInTransaction = transaction as unknown as CleanupDatabase;
        const claims = Array.from((await databaseInTransaction.execute(sql`
          select id
          from community_object_deletion_jobs
          where id = ${candidate.id} and status = 'claimed' and claim_id = ${candidate.claimId}
          for update
        `)) as Iterable<{ id: string }>);
        if (!claims.length) return false;
        await tombstoneCommunityObjectKeysInDatabase(candidate.objectKeys, targets, databaseInTransaction);
        return true;
      });
    },

    async finalize(candidate) {
      return database.transaction(async (transaction) => {
        const databaseInTransaction = transaction as unknown as CleanupDatabase;
        const claims = Array.from((await databaseInTransaction.execute(sql`
          select id
          from community_object_deletion_jobs
          where id = ${candidate.id} and status = 'claimed' and claim_id = ${candidate.claimId}
          for update
        `)) as Iterable<{ id: string }>);
        if (!claims.length) return false;

        let sourceMissing = false;
        if (candidate.action !== "objects_only" && !(await sourceStillMatches(databaseInTransaction, candidate))) {
          const sourceExists = await sourceStillMatches(databaseInTransaction, { ...candidate, expectedLifecycleVersion: null });
          if (sourceExists) return false;
          sourceMissing = true;
        }

        if (!sourceMissing && candidate.action === "redact_message") {
          await databaseInTransaction.delete(clubMessageMentions).where(eq(clubMessageMentions.messageId, candidate.sourceId));
          await databaseInTransaction.delete(clubPolls).where(eq(clubPolls.messageId, candidate.sourceId));
          await databaseInTransaction.delete(appNotifications).where(and(
            eq(appNotifications.sourceId, candidate.sourceId),
            inArray(appNotifications.source, ["community_reply", "community_mention", "community_all"])
          ));
          await databaseInTransaction.update(clubMessageAttachments).set({
            scanStatus: "deleted",
            deletedAt: sql`clock_timestamp()`
          }).where(eq(clubMessageAttachments.messageId, candidate.sourceId));
          await databaseInTransaction.update(communityUploadManifests).set({
            status: "aborted",
            updatedAt: sql`clock_timestamp()`
          }).where(inArray(
            communityUploadManifests.attachmentId,
            databaseInTransaction.select({ id: clubMessageAttachments.id })
              .from(clubMessageAttachments)
              .where(eq(clubMessageAttachments.messageId, candidate.sourceId))
          ));
          const updated = await databaseInTransaction.update(clubChatMessages).set({
            body: "",
            deletedContentExpiresAt: null,
            deletedCleanupClaimId: null,
            deletedCleanupClaimedAt: null,
            updatedAt: sql`clock_timestamp()`
          }).where(and(
            eq(clubChatMessages.id, candidate.sourceId),
            eq(clubChatMessages.lifecycleVersion, candidate.expectedLifecycleVersion!)
          )).returning({ id: clubChatMessages.id });
          if (!updated.length) return false;
        } else if (!sourceMissing && candidate.action === "delete_message") {
          const deleted = await databaseInTransaction.delete(clubChatMessages).where(and(
            eq(clubChatMessages.id, candidate.sourceId),
            eq(clubChatMessages.lifecycleVersion, candidate.expectedLifecycleVersion!)
          )).returning({ id: clubChatMessages.id });
          if (!deleted.length) return false;
        } else if (!sourceMissing && candidate.action === "delete_attachment") {
          const updated = await databaseInTransaction.update(clubMessageAttachments).set({
            scanStatus: "deleted",
            deletedAt: sql`clock_timestamp()`
          }).where(and(
            eq(clubMessageAttachments.id, candidate.sourceId),
            eq(clubMessageAttachments.lifecycleVersion, candidate.expectedLifecycleVersion!)
          )).returning({ id: clubMessageAttachments.id });
          if (!updated.length) return false;
        } else if (!sourceMissing && candidate.action === "delete_manifest") {
          const deleted = await databaseInTransaction.delete(communityUploadManifests).where(and(
            eq(communityUploadManifests.id, candidate.sourceId),
            eq(communityUploadManifests.lifecycleVersion, candidate.expectedLifecycleVersion!)
          )).returning({ id: communityUploadManifests.id });
          if (!deleted.length) return false;
        }

        const deletedJobs = await databaseInTransaction.delete(communityObjectDeletionJobs).where(and(
          eq(communityObjectDeletionJobs.id, candidate.id),
          eq(communityObjectDeletionJobs.claimId, candidate.claimId)
        )).returning({ id: communityObjectDeletionJobs.id });
        return deletedJobs.length === 1;
      });
    },

    async release(candidate, error) {
      await database.update(communityObjectDeletionJobs).set({
        status: "pending",
        claimId: null,
        claimedAt: null,
        lastError: error,
        notBefore: sql`clock_timestamp() + least(interval '1 hour', (${communityObjectDeletionJobs.attempts} * interval '30 seconds'))`,
        updatedAt: sql`clock_timestamp()`
      }).where(and(
        eq(communityObjectDeletionJobs.id, candidate.id),
        eq(communityObjectDeletionJobs.claimId, candidate.claimId)
      ));
    }
  };
}

export const communityObjectDeletionRepository = createCommunityObjectDeletionRepository();
const cleanupCommunityObjectDeletionJobs = createCommunityObjectDeletionCleanup({
  repository: communityObjectDeletionRepository,
  deleteObjectCopies: deleteCommunityObjectCopiesConvergently,
  deleteObjectKeys: deleteCommunityObjectKeysConvergently,
  logger
});

export async function cleanupCommunityObjectDeletionLedger() {
  await recoverStaleAttachmentPublications().catch((error) => {
    logger.warn({ error }, "stale attachment publication recovery failed");
  });
  await runCommunityObjectTombstoneSweepBatch().catch((error) => {
    logger.warn({ error }, "community object tombstone sweep failed");
  });
  return cleanupCommunityObjectDeletionJobs();
}

export async function enqueueCommunityMessageDeletionBatch(input: {
  topicId: string;
  userId?: string;
  includeSystem?: boolean;
  limit?: number;
}, database: CleanupDatabase = db) {
  const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? communityObjectDeletionBatchSize)), communityObjectDeletionBatchSize);
  const requestKey = `${input.topicId}:${input.userId ?? "*"}:${input.includeSystem ? "all" : "user"}`;
  await database.execute(sql`
    insert into community_message_purge_requests (
      request_key, topic_id, user_id, include_system, updated_at
    ) values (
      ${requestKey}, ${input.topicId}, ${input.userId ?? null}, ${input.includeSystem ?? false}, clock_timestamp()
    )
    on conflict (request_key) do update set updated_at = clock_timestamp()
  `);
  const rows = Array.from((await database.execute(sql`
    with candidates as materialized (
      select message.id
      from club_chat_messages message
      where message.topic_id = ${input.topicId}
        and message.terminal_cleanup_at is null
        ${input.userId ? sql`and message.user_id = ${input.userId}` : sql``}
        ${input.includeSystem ? sql`` : sql`and message.is_system = false`}
      order by message.created_at, message.id
      limit ${limit}
      for update skip locked
    )
    select id, community_enqueue_message_cleanup(id, 'delete_message') as job_id
    from candidates
  `)) as Iterable<{ id: string; jobId: string | null }>);
  return rows.filter((row) => row.jobId).length;
}

export async function enqueueCommunityMessageDeletion(messageId: string, database: CleanupDatabase = db) {
  const rows = Array.from((await database.execute(sql`
    select community_enqueue_message_cleanup(${messageId}, 'delete_message') as "jobId"
  `)) as Iterable<{ jobId: string | null }>);
  return rows[0]?.jobId ?? null;
}

type CleanupJobDependencies = {
  cleanup: () => Promise<unknown>;
  setInterval: (run: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
  logger: Pick<typeof logger, "warn">;
};

export function createCommunityObjectDeletionCleanupJob(dependencies: CleanupJobDependencies) {
  let active: Promise<void> | null = null;
  let stopped = false;
  const run = () => {
    if (stopped || active) return active;
    active = Promise.resolve(dependencies.cleanup())
      .then(() => undefined)
      .catch((error) => dependencies.logger.warn({ error }, "community object deletion job failed"))
      .finally(() => { active = null; });
    return active;
  };
  const timer = dependencies.setInterval(() => void run(), communityObjectDeletionIntervalMs);
  void run();
  return {
    timer,
    async stop() {
      stopped = true;
      dependencies.clearInterval(timer);
      await active;
    }
  };
}

export function startCommunityObjectDeletionCleanupJob() {
  return createCommunityObjectDeletionCleanupJob({
    cleanup: cleanupCommunityObjectDeletionLedger,
    setInterval,
    clearInterval,
    logger
  });
}
