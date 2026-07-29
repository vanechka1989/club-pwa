import { sql } from "drizzle-orm";
import type { logger as applicationLogger } from "../logger";
import {
  tombstoneCommunityObjectKeysInDatabase,
  type CommunityObjectStorageTarget
} from "./objectLifecycle";

export const communityAttachmentPublicationRecoveryBatchSize = 20;
export const communityAttachmentPublicationStaleMs = 5 * 60_000;

type RecoveryDatabase = (typeof import("../db/client"))["db"];

export type RecoveredAttachmentPublication = {
  messageId: string;
  objectKeys: string[];
};

type RecoverBatchInput = {
  limit: number;
  staleMs: number;
  targets: CommunityObjectStorageTarget[];
};

export function createCommunityAttachmentPublicationRecovery(dependencies: {
  loadTargets: () => Promise<CommunityObjectStorageTarget[]>;
  recoverBatch: (input: RecoverBatchInput) => Promise<RecoveredAttachmentPublication[]>;
  logger: Pick<typeof applicationLogger, "info">;
}) {
  return async function recoverStaleAttachmentPublications() {
    const targets = await dependencies.loadTargets();
    const recovered = await dependencies.recoverBatch({
      limit: communityAttachmentPublicationRecoveryBatchSize,
      staleMs: communityAttachmentPublicationStaleMs,
      targets
    });
    const recoveredMessageIds = recovered.map((item) => item.messageId).sort();
    const recoveredObjectKeys = [...new Set(recovered.flatMap((item) => item.objectKeys))].sort();
    if (recovered.length) {
      dependencies.logger.info({
        count: recovered.length,
        recoveredMessageIds,
        objectKeyCount: recoveredObjectKeys.length
      }, "stale attachment publications fenced");
    }
    return { recoveredMessageIds, recoveredObjectKeys };
  };
}

export async function recoverStaleAttachmentPublicationsInDatabase(
  input: RecoverBatchInput,
  database: RecoveryDatabase
): Promise<RecoveredAttachmentPublication[]> {
  const limit = Math.min(
    communityAttachmentPublicationRecoveryBatchSize,
    Math.max(1, Math.trunc(input.limit))
  );
  const staleMs = Math.max(communityAttachmentPublicationStaleMs, Math.trunc(input.staleMs));
  const targets = [...new Set(input.targets)].sort() as CommunityObjectStorageTarget[];
  if (!targets.length) throw new Error("community_object_storage_targets_required");

  return database.transaction(async (transaction) => {
    const activeDatabase = transaction as unknown as RecoveryDatabase;
    const candidates = Array.from((await activeDatabase.execute(sql`
      with stale_candidates as materialized (
        select message.id as "messageId", message.created_at
        from club_chat_messages message
        where exists (
          select 1
          from club_message_attachments attachment
          join community_object_publications publication
            on publication.source_type = 'attachment'
           and publication.source_id = attachment.id
           and publication.object_key = attachment.object_key
          where attachment.message_id = message.id
            and publication.state = 'publishing'
            and publication.updated_at <= clock_timestamp()
              - (${staleMs} * interval '1 millisecond')
        )
        order by message.created_at, message.id
        limit ${limit}
      )
      select "messageId"
      from stale_candidates
      where pg_try_advisory_xact_lock(hashtextextended("messageId"::text, 0))
      order by created_at, "messageId"
    `)) as Iterable<{ messageId: string }>);
    const recovered: RecoveredAttachmentPublication[] = [];

    for (const candidate of candidates) {
      const attachmentKeys = Array.from((await activeDatabase.execute(sql`
        select object_key as "objectKey"
        from club_message_attachments
        where message_id = ${candidate.messageId}
        order by object_key, id
      `)) as Iterable<{ objectKey: string }>).map((row) => row.objectKey);
      if (!attachmentKeys.length) continue;

      const publications = Array.from((await activeDatabase.execute(sql`
        select publication.id,
               publication.updated_at <= clock_timestamp()
                 - (${staleMs} * interval '1 millisecond') as "isStale"
        from community_object_publications publication
        join club_message_attachments attachment
          on attachment.id = publication.source_id
         and publication.source_type = 'attachment'
         and attachment.object_key = publication.object_key
        where attachment.message_id = ${candidate.messageId}
          and publication.state = 'publishing'
        order by publication.id
        for update of publication
      `)) as Iterable<{ id: string; isStale: boolean }>);
      if (!publications.some((publication) => publication.isStale)) continue;

      await activeDatabase.execute(sql`
        select object_key, target
        from community_object_lifecycles
        where object_key in (${sql.join(attachmentKeys.map((key) => sql`${key}`), sql`, `)})
        order by object_key, target
        for update
      `);
      const liveMessage = Array.from((await activeDatabase.execute(sql`
        select id from club_chat_messages where id = ${candidate.messageId} for update
      `)) as Iterable<{ id: string }>);
      if (!liveMessage.length) continue;
      await activeDatabase.execute(sql`
        select id
        from club_message_attachments
        where message_id = ${candidate.messageId}
        order by id
        for update
      `);
      const jobs = Array.from((await activeDatabase.execute(sql`
        select community_enqueue_message_cleanup(${candidate.messageId}, 'delete_message') as "jobId"
      `)) as Iterable<{ jobId: string | null }>);
      const jobId = jobs[0]?.jobId;
      if (!jobId) continue;
      await activeDatabase.execute(sql`
        update club_chat_messages
        set status = 'deleted', purge_at = clock_timestamp(), updated_at = clock_timestamp()
        where id = ${candidate.messageId}
      `);
      const objectKeys = Array.from((await activeDatabase.execute(sql`
        select object_key as "objectKey"
        from community_object_deletion_entries
        where job_id = ${jobId}
        order by object_key
      `)) as Iterable<{ objectKey: string }>).map((row) => row.objectKey);
      await tombstoneCommunityObjectKeysInDatabase(objectKeys, targets, activeDatabase);
      recovered.push({ messageId: candidate.messageId, objectKeys });
    }
    return recovered;
  });
}

export async function recoverStaleAttachmentPublications() {
  const [{ db }, storage, { logger }] = await Promise.all([
    import("../db/client"),
    import("../storage/s3"),
    import("../logger")
  ]);
  return createCommunityAttachmentPublicationRecovery({
    loadTargets: storage.getConfiguredS3Targets,
    recoverBatch: (input) => recoverStaleAttachmentPublicationsInDatabase(input, db),
    logger
  })();
}
