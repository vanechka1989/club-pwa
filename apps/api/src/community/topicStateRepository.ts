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
            set last_read_message_id = case
                  when community_topic_reads.last_read_message_id is null then excluded.last_read_message_id
                  when exists (
                    select 1
                    from club_chat_messages current_message
                    inner join club_chat_messages candidate
                      on candidate.id = excluded.last_read_message_id
                    where current_message.id = community_topic_reads.last_read_message_id
                      and (
                        candidate.created_at > current_message.created_at
                        or (
                          candidate.created_at = current_message.created_at
                          and candidate.id > current_message.id
                        )
                      )
                  ) then excluded.last_read_message_id
                  else community_topic_reads.last_read_message_id
                end,
                last_read_at = now()
            returning last_read_message_id as "lastReadMessageId"
          )
          select "lastReadMessageId"
          from upserted
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

      const requestedTopicValues = sql.join(
        topicIds.map((topicId) => sql`(${topicId}::uuid)`),
        sql`, `
      );
      const stateRows = await executeRows<StateRow & UnreadRow>(
        database,
        sql`
          with requested(topic_id) as (
            values ${requestedTopicValues}
          ),
          topic_state as materialized (
            select requested.topic_id,
                   topic_read.last_read_message_id,
                   read_message.created_at as last_read_created_at,
                   coalesce(notification.mode, 'mentions') as notification_mode
            from requested
            left join community_topic_reads topic_read
              on topic_read.user_id = ${userId}
             and topic_read.topic_id = requested.topic_id
            left join club_chat_messages read_message
              on read_message.id = topic_read.last_read_message_id
            left join community_topic_notification_settings notification
              on notification.user_id = ${userId}
             and notification.topic_id = requested.topic_id
          ),
          unread as (
            select topic_state.topic_id,
                   count(candidate.id)::int as unread_count
            from topic_state
            inner join club_chat_messages candidate
              on candidate.topic_id = topic_state.topic_id
             and candidate.user_id <> ${userId}
             and candidate.is_system = false
             and candidate.status = 'visible'
             and candidate.deleted_by_user_at is null
             and (
               topic_state.last_read_message_id is null
               or candidate.created_at > topic_state.last_read_created_at
               or (
                 candidate.created_at = topic_state.last_read_created_at
                 and candidate.id > topic_state.last_read_message_id
               )
             )
            group by topic_state.topic_id
          )
          select topic_state.topic_id as "topicId",
                 topic_state.last_read_message_id as "lastReadMessageId",
                 topic_state.notification_mode as "notificationMode",
                 coalesce(unread.unread_count, 0)::int as "unreadCount"
          from topic_state
          left join unread on unread.topic_id = topic_state.topic_id
        `
      );

      return new Map(
        stateRows.map((row) => [
          row.topicId,
          {
            unreadCount: row.unreadCount,
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
