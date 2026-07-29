import { sql, type SQL } from "drizzle-orm";
import { getOwnerTelegramId } from "../admin/roles";
import { db } from "../db/client";
import { appNotifications } from "../db/schema";
import { logger } from "../logger";
import { sendWebPushToUser } from "../push/webPush";

export const communityNotificationOutboxBatchSize = 100;
export const communityNotificationOutboxConcurrency = 8;
export const communityNotificationOutboxIntervalMs = 5_000;
const outboxClaimStaleMs = 5 * 60_000;

export type CommunityNotificationReason = "reply" | "mention" | "all";
export type CommunityNotificationOutboxCandidate = {
  id: string;
  claimId: string;
  userId: string;
  topicId: string;
  messageId: string;
  accessVersion: number;
  reason: CommunityNotificationReason;
  title: string;
  body: string;
  pushUrl: string;
};

export type CommunityNotificationEnqueueInput = {
  messageId: string;
  topicId: string;
  topicTitle: string;
  senderUserId: string;
  senderName: string;
  replyUserId: string | null;
  mentionUserIds: string[];
};

type ExecuteDatabase = Pick<typeof db, "execute">;

function explicitRecipientValues(input: CommunityNotificationEnqueueInput): SQL {
  const recipients = new Map<string, { reason: "reply" | "mention"; priority: number }>();
  if (input.replyUserId) recipients.set(input.replyUserId, { reason: "reply", priority: 1 });
  for (const userId of input.mentionUserIds) {
    if (!recipients.has(userId)) recipients.set(userId, { reason: "mention", priority: 2 });
  }
  if (!recipients.size) {
    return sql`select null::uuid as user_id, null::text as reason, null::integer as priority where false`;
  }
  return sql`values ${sql.join(
    [...recipients.entries()].map(([userId, value]) => sql`(${userId}::uuid, ${value.reason}::text, ${value.priority}::integer)`),
    sql`, `
  )}`;
}

function accessCondition(ownerTelegramId: string) {
  return sql`(
    lower(recipient.telegram_id) = lower(${ownerTelegramId})
    or exists (
      select 1 from admin_users admin
      where lower(admin.telegram_id) = lower(recipient.telegram_id)
        and admin.is_active = true
        and admin.permissions ? 'community'
    )
    or (
      topic.is_published = true
      and topic.is_admin_only = false
      and coalesce((
        select membership.status = 'active'
          and (membership.expires_at is null or membership.expires_at > clock_timestamp())
        from subscriptions membership
        where membership.user_id = recipient.id
        order by membership.created_at desc
        limit 1
      ), false)
    )
  )`;
}

export function storedCommunityNotificationAccessCondition(ownerTelegramId: string) {
  return sql<boolean>`(
    (
      (
        ${appNotifications.source} is null
        or ${appNotifications.source} not in ('community_reply','community_mention','community_all')
      )
      and ${appNotifications.communityTopicId} is null
    )
    or exists (
      select 1
      from users recipient
      join club_chat_topics topic on topic.id = ${appNotifications.communityTopicId}
      join club_chat_messages message
        on message.id = ${appNotifications.sourceId}
       and message.topic_id = topic.id
      where recipient.id = ${appNotifications.userId}
        and recipient.community_access_version = ${appNotifications.communityAccessVersion}
        and message.status = 'visible'
        and message.deleted_by_user_at is null
        and ${accessCondition(ownerTelegramId)}
    )
  )`;
}

export async function enqueueCommunityNotificationsWithDependencies(
  input: CommunityNotificationEnqueueInput,
  dependencies: { database: ExecuteDatabase; ownerTelegramId: string }
) {
  const explicit = explicitRecipientValues(input);
  await dependencies.database.execute(sql`
    with explicit(user_id, reason, priority) as (${explicit}),
    candidates as materialized (
      select user_id, reason, priority from explicit
      union all
      select setting.user_id, 'all'::text, 3
      from community_topic_notification_settings setting
      where setting.topic_id = ${input.topicId}
        and setting.mode = 'all'
    ),
    selected as (
      select distinct on (candidate.user_id)
             candidate.user_id, candidate.reason
      from candidates candidate
      order by candidate.user_id, candidate.priority
    ),
    eligible as (
      select selected.user_id, selected.reason, recipient.community_access_version
      from selected
      join users recipient on recipient.id = selected.user_id
      join club_chat_topics topic on topic.id = ${input.topicId}
      left join community_topic_notification_settings setting
        on setting.user_id = selected.user_id and setting.topic_id = topic.id
      where selected.user_id <> ${input.senderUserId}
        and coalesce(setting.mode, 'mentions') <> 'off'
        and ${accessCondition(dependencies.ownerTelegramId)}
    )
    insert into community_notification_outbox (
      user_id, topic_id, message_id, access_version, reason,
      title, body, push_url, status, next_attempt_at, updated_at
    )
    select eligible.user_id, ${input.topicId}, ${input.messageId}, eligible.community_access_version,
           eligible.reason,
           case eligible.reason
             when 'reply' then ${`Ответ в чате: ${input.topicTitle}`}
             when 'mention' then ${`Вас упомянули: ${input.topicTitle}`}
             else ${`Новое сообщение: ${input.topicTitle}`}
           end,
           case eligible.reason
             when 'reply' then ${`Новый ответ в чате "${input.topicTitle}". Автор: ${input.senderName}.`}
             when 'mention' then ${`Новое упоминание в чате "${input.topicTitle}". Автор: ${input.senderName}.`}
             else ${`Новое сообщение в чате "${input.topicTitle}". Автор: ${input.senderName}.`}
           end,
           ${`/community/topics/${input.topicId}?message=${input.messageId}`},
           'pending', clock_timestamp(), clock_timestamp()
    from eligible
    on conflict (user_id, message_id, reason) do nothing
  `);
}

export async function enqueueCommunityNotifications(
  input: CommunityNotificationEnqueueInput,
  database: ExecuteDatabase = db
) {
  return enqueueCommunityNotificationsWithDependencies(input, {
    database,
    ownerTelegramId: await getOwnerTelegramId()
  });
}

export interface CommunityNotificationOutboxRepository {
  claimBatch(input: { limit: number }): Promise<CommunityNotificationOutboxCandidate[]>;
  persistIfAccessible(candidate: CommunityNotificationOutboxCandidate): Promise<{ notificationId: string } | null>;
  isStillAccessible(candidate: CommunityNotificationOutboxCandidate): Promise<boolean>;
  finalize(candidate: CommunityNotificationOutboxCandidate): Promise<boolean>;
  revoke(candidate: CommunityNotificationOutboxCandidate): Promise<void>;
  release(candidate: CommunityNotificationOutboxCandidate, error: string): Promise<void>;
}

type OutboxDatabase = typeof db;

function sourceForReason(reason: CommunityNotificationReason) {
  return `community_${reason}`;
}

export function createCommunityNotificationOutboxRepository(
  database: OutboxDatabase = db,
  loadOwnerTelegramId: () => Promise<string> = getOwnerTelegramId
): CommunityNotificationOutboxRepository {
  return {
    async claimBatch({ limit }) {
      const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), communityNotificationOutboxBatchSize);
      return Array.from((await database.execute(sql`
        with candidates as (
          select id
          from community_notification_outbox
          where next_attempt_at <= clock_timestamp()
            and (
              status = 'pending'
              or (status = 'claimed' and claimed_at <= clock_timestamp() - (${outboxClaimStaleMs} * interval '1 millisecond'))
            )
          order by next_attempt_at, created_at, id
          limit ${boundedLimit}
          for update skip locked
        )
        update community_notification_outbox outbox
        set status = 'claimed', claim_id = gen_random_uuid(), claimed_at = clock_timestamp(),
            attempt_count = attempt_count + 1, updated_at = clock_timestamp()
        from candidates
        where outbox.id = candidates.id
        returning outbox.id, outbox.claim_id as "claimId", outbox.user_id as "userId",
                  outbox.topic_id as "topicId", outbox.message_id as "messageId",
                  outbox.access_version as "accessVersion", outbox.reason,
                  outbox.title, outbox.body, outbox.push_url as "pushUrl"
      `)) as Iterable<CommunityNotificationOutboxCandidate>);
    },

    async persistIfAccessible(candidate) {
      const ownerTelegramId = await loadOwnerTelegramId();
      return database.transaction(async (transaction) => {
        const rows = Array.from((await transaction.execute(sql`
          with claimed as materialized (
            select outbox.*
            from community_notification_outbox outbox
            where outbox.id = ${candidate.id}
              and outbox.status = 'claimed'
              and outbox.claim_id = ${candidate.claimId}
            for update
          ),
          eligible as materialized (
            select claimed.*
            from claimed
            join users recipient on recipient.id = claimed.user_id
            join club_chat_topics topic on topic.id = claimed.topic_id
            join club_chat_messages message
              on message.id = claimed.message_id and message.topic_id = topic.id
            where recipient.community_access_version = claimed.access_version
              and message.status = 'visible'
              and message.deleted_by_user_at is null
              and ${accessCondition(ownerTelegramId)}
            for share of recipient, topic, message
          ),
          persisted as (
            insert into app_notifications (
              user_id, kind, title, body, source, source_id,
              community_topic_id, community_access_version
            )
            select eligible.user_id, 'client', eligible.title, eligible.body,
                   ('community_' || eligible.reason), eligible.message_id,
                   eligible.topic_id, eligible.access_version
            from eligible
            on conflict (user_id, source, source_id)
              where source in ('community_reply','community_mention','community_all')
            do update set
              title = excluded.title,
              body = excluded.body,
              community_topic_id = excluded.community_topic_id,
              community_access_version = excluded.community_access_version
            returning id
          )
          select id as "notificationId" from persisted limit 1
        `)) as Iterable<{ notificationId: string }>);
        return rows[0] ?? null;
      });
    },

    async isStillAccessible(candidate) {
      const ownerTelegramId = await loadOwnerTelegramId();
      const rows = Array.from((await database.execute(sql`
        select outbox.id
        from community_notification_outbox outbox
        join users recipient on recipient.id = outbox.user_id
        join club_chat_topics topic on topic.id = outbox.topic_id
        join club_chat_messages message
          on message.id = outbox.message_id and message.topic_id = topic.id
        where outbox.id = ${candidate.id}
          and outbox.status = 'claimed'
          and outbox.claim_id = ${candidate.claimId}
          and recipient.community_access_version = outbox.access_version
          and message.status = 'visible'
          and message.deleted_by_user_at is null
          and ${accessCondition(ownerTelegramId)}
        limit 1
      `)) as Iterable<{ id: string }>);
      return rows.length === 1;
    },

    async finalize(candidate) {
      const rows = Array.from((await database.execute(sql`
        delete from community_notification_outbox
        where id = ${candidate.id} and status = 'claimed' and claim_id = ${candidate.claimId}
        returning id
      `)) as Iterable<{ id: string }>);
      return rows.length === 1;
    },

    async revoke(candidate) {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`
          delete from app_notifications
          where user_id = ${candidate.userId}
            and source = ${sourceForReason(candidate.reason)}
            and source_id = ${candidate.messageId}
        `);
        await transaction.execute(sql`
          delete from community_notification_outbox
          where id = ${candidate.id} and claim_id = ${candidate.claimId}
        `);
      });
    },

    async release(candidate, error) {
      await database.execute(sql`
        update community_notification_outbox
        set status = 'pending', claim_id = null, claimed_at = null,
            last_error = ${error.slice(0, 500)},
            next_attempt_at = clock_timestamp() + least(interval '30 minutes', attempt_count * interval '10 seconds'),
            updated_at = clock_timestamp()
        where id = ${candidate.id} and claim_id = ${candidate.claimId}
      `);
    }
  };
}

type WorkerDependencies = {
  repository: CommunityNotificationOutboxRepository;
  sendPush: (userId: string, payload: { title: string; body: string; url: string }) => Promise<unknown>;
  logger: Pick<typeof logger, "info" | "warn">;
};

export function createCommunityNotificationOutboxWorker(dependencies: WorkerDependencies) {
  return async function runCommunityNotificationOutbox() {
    const candidates = await dependencies.repository.claimBatch({ limit: communityNotificationOutboxBatchSize });
    const totals = { pushed: 0, revoked: 0, failed: 0 };
    for (let offset = 0; offset < candidates.length; offset += communityNotificationOutboxConcurrency) {
      const chunk = candidates.slice(offset, offset + communityNotificationOutboxConcurrency);
      await Promise.all(chunk.map(async (candidate) => {
        try {
          const persisted = await dependencies.repository.persistIfAccessible(candidate);
          if (!persisted || !(await dependencies.repository.isStillAccessible(candidate))) {
            await dependencies.repository.revoke(candidate);
            totals.revoked += 1;
            return;
          }
          await dependencies.sendPush(candidate.userId, {
            title: candidate.title,
            body: candidate.body,
            url: candidate.pushUrl
          });
          if (!(await dependencies.repository.finalize(candidate))) {
            throw new Error("notification_outbox_claim_lost");
          }
          totals.pushed += 1;
        } catch (error) {
          const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
          await dependencies.repository.release(candidate, message).catch((releaseError) => {
            dependencies.logger.warn({ error: releaseError, outboxId: candidate.id }, "community notification release failed");
          });
          dependencies.logger.warn({ error, outboxId: candidate.id }, "community notification delivery failed");
          totals.failed += 1;
        }
      }));
    }
    if (totals.pushed || totals.revoked) {
      dependencies.logger.info(totals, "community notification outbox processed");
    }
    return totals;
  };
}

export const communityNotificationOutboxRepository = createCommunityNotificationOutboxRepository();
export const runCommunityNotificationOutbox = createCommunityNotificationOutboxWorker({
  repository: communityNotificationOutboxRepository,
  sendPush: sendWebPushToUser,
  logger
});

export function startCommunityNotificationOutboxJob(intervalMs = communityNotificationOutboxIntervalMs) {
  let active: Promise<void> | null = null;
  let stopped = false;
  const run = () => {
    if (stopped || active) return active;
    active = runCommunityNotificationOutbox()
      .then(() => undefined)
      .catch((error) => logger.warn({ error }, "community notification outbox job failed"))
      .finally(() => { active = null; });
    return active;
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    }
  };
}
