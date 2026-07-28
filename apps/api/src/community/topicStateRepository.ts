import type { CommunityNotificationMode, CommunityTopicState } from "@club/shared";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";

type TopicStateDatabase = {
  execute(query: SQL): PromiseLike<unknown>;
};

type ReadRow = {
  lastReadMessageId: string | null;
};

type StateRow = ReadRow & {
  topicId: string;
  notificationMode: CommunityNotificationMode;
};

type UnreadRow = {
  topicId: string;
  unreadCount: number;
};

async function executeRows<T>(database: TopicStateDatabase, query: SQL): Promise<T[]> {
  return Array.from((await database.execute(query)) as Iterable<T>);
}

export function createTopicStateRepository(database: TopicStateDatabase = db) {
  return {
    async markRead(input: { userId: string; topicId: string; messageId: string }) {
      const rows = await executeRows<ReadRow>(
        database,
        sql`
          with candidate as (
            select candidate.id, candidate.created_at
            from club_chat_messages candidate
            where candidate.id = ${input.messageId}
              and candidate.topic_id = ${input.topicId}
          ),
          upserted as (
            insert into community_topic_reads (user_id, topic_id, last_read_message_id, last_read_at)
            select ${input.userId}, ${input.topicId}, candidate.id, now()
            from candidate
            on conflict (user_id, topic_id) do update
            set last_read_message_id = excluded.last_read_message_id,
                last_read_at = now()
            where community_topic_reads.last_read_message_id is null
              or exists (
                select 1
                from club_chat_messages current_message, candidate
                where current_message.id = community_topic_reads.last_read_message_id
                  and (
                    candidate.created_at > current_message.created_at
                    or (
                      candidate.created_at = current_message.created_at
                      and candidate.id > current_message.id
                    )
                  )
              )
            returning last_read_message_id as "lastReadMessageId"
          )
          select "lastReadMessageId"
          from upserted
          union all
          select current_read.last_read_message_id as "lastReadMessageId"
          from community_topic_reads current_read
          inner join candidate on true
          where current_read.user_id = ${input.userId}
            and current_read.topic_id = ${input.topicId}
            and not exists (select 1 from upserted)
          limit 1
        `
      );

      return rows[0]?.lastReadMessageId ?? null;
    },

    async getReadMessageId(userId: string, topicId: string) {
      const rows = await executeRows<ReadRow>(
        database,
        sql`
          select last_read_message_id as "lastReadMessageId"
          from community_topic_reads
          where user_id = ${userId}
            and topic_id = ${topicId}
          limit 1
        `
      );
      return rows[0]?.lastReadMessageId ?? null;
    },

    async setNotificationMode(input: {
      userId: string;
      topicId: string;
      mode: CommunityNotificationMode;
    }) {
      await database.execute(sql`
        insert into community_topic_notification_settings (user_id, topic_id, mode, updated_at)
        values (${input.userId}, ${input.topicId}, ${input.mode}, now())
        on conflict (user_id, topic_id) do update
        set mode = excluded.mode,
            updated_at = now()
      `);
    },

    async getStates(userId: string, topicIds: string[]): Promise<Map<string, CommunityTopicState>> {
      if (!topicIds.length) {
        return new Map();
      }

      const [stateRows, unreadRows] = await Promise.all([
        executeRows<StateRow>(
          database,
          sql`
            with requested(topic_id) as (
              select unnest(${topicIds}::uuid[])
            )
            select requested.topic_id as "topicId",
                   topic_read.last_read_message_id as "lastReadMessageId",
                   coalesce(notification.mode, 'mentions') as "notificationMode"
            from requested
            left join community_topic_reads topic_read
              on topic_read.user_id = ${userId}
             and topic_read.topic_id = requested.topic_id
            left join community_topic_notification_settings notification
              on notification.user_id = ${userId}
             and notification.topic_id = requested.topic_id
          `
        ),
        executeRows<UnreadRow>(
          database,
          sql`
            select candidate.topic_id as "topicId",
                   count(*)::int as "unreadCount"
            from club_chat_messages candidate
            left join community_topic_reads topic_read
              on topic_read.user_id = ${userId}
             and topic_read.topic_id = candidate.topic_id
            left join club_chat_messages read_message
              on read_message.id = topic_read.last_read_message_id
            where candidate.topic_id = any(${topicIds}::uuid[])
              and candidate.is_system = false
              and candidate.status = 'visible'
              and candidate.deleted_by_user_at is null
              and (
                topic_read.last_read_message_id is null
                or candidate.created_at > read_message.created_at
                or (
                  candidate.created_at = read_message.created_at
                  and candidate.id > read_message.id
                )
              )
            group by candidate.topic_id
          `
        )
      ]);

      const unreadByTopic = new Map(unreadRows.map((row) => [row.topicId, row.unreadCount]));
      return new Map(
        stateRows.map((row) => [
          row.topicId,
          {
            unreadCount: unreadByTopic.get(row.topicId) ?? 0,
            lastReadMessageId: row.lastReadMessageId,
            notificationMode: row.notificationMode
          }
        ])
      );
    },

    async getState(userId: string, topicId: string): Promise<CommunityTopicState> {
      const states = await this.getStates(userId, [topicId]);
      return states.get(topicId) ?? {
        unreadCount: 0,
        lastReadMessageId: null,
        notificationMode: "mentions"
      };
    }
  };
}

export const topicStateRepository = createTopicStateRepository();
