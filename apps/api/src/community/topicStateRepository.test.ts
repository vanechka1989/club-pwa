import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  db: { execute: vi.fn() }
}));

import { createTopicStateRepository } from "./topicStateRepository";

const userId = "00000000-0000-0000-0000-000000000001";
const topicId = "00000000-0000-0000-0000-000000000002";
const olderId = "00000000-0000-0000-0000-000000000003";
const newerId = "00000000-0000-0000-0000-000000000004";

const dialect = new PgDialect();

describe("topic state repository", () => {
  const execute = vi.fn();
  const repository = createTopicStateRepository({ execute } as never);

  beforeEach(() => {
    execute.mockReset();
  });

  it("inserts the first read position and returns the accepted message id", async () => {
    execute.mockResolvedValueOnce([{ lastReadMessageId: newerId }]);

    await expect(repository.markRead({ userId, topicId, messageId: newerId })).resolves.toBe(newerId);

    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain("insert into community_topic_reads");
    expect(query.params).toEqual(expect.arrayContaining([userId, topicId, newerId]));
  });

  it("uses timestamp plus message id as an atomic forward-only upsert rule", async () => {
    execute
      .mockResolvedValueOnce([{ lastReadMessageId: newerId }])
      .mockResolvedValueOnce([{ lastReadMessageId: newerId }])
      .mockResolvedValueOnce([{ lastReadMessageId: newerId }]);

    await repository.markRead({ userId, topicId, messageId: newerId });
    await repository.markRead({ userId, topicId, messageId: olderId });

    await expect(repository.getReadMessageId(userId, topicId)).resolves.toBe(newerId);

    const upsertQuery = dialect.sqlToQuery(execute.mock.calls[1]![0]).sql;
    expect(upsertQuery).toContain("last_read_created_at");
    expect(upsertQuery).toContain("excluded.last_read_created_at > community_topic_reads.last_read_created_at");
    expect(upsertQuery).toContain("excluded.last_read_created_at = community_topic_reads.last_read_created_at");
    expect(upsertQuery).toContain("excluded.last_read_message_id > community_topic_reads.last_read_message_id");
  });

  it("rejects a candidate that does not belong to the topic", async () => {
    execute.mockResolvedValueOnce([]);

    await expect(repository.markRead({ userId, topicId, messageId: newerId })).resolves.toBeNull();

    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain("candidate.topic_id =");
    expect(query.params).toEqual(expect.arrayContaining([topicId, newerId]));
  });

  it("upserts a per-topic notification mode", async () => {
    execute.mockResolvedValueOnce([]);

    await repository.setNotificationMode({ userId, topicId, mode: "off" });

    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain("insert into community_topic_notification_settings");
    expect(query.sql).toContain("on conflict (user_id, topic_id) do update");
    expect(query.params).toEqual(expect.arrayContaining([userId, topicId, "off"]));
  });

  it("loads all topic states and grouped unread counts in one statement", async () => {
    const secondTopicId = "00000000-0000-0000-0000-000000000005";
    execute.mockResolvedValueOnce([
      { topicId, lastReadMessageId: newerId, notificationMode: "all", unreadCount: 2 },
      { topicId: secondTopicId, lastReadMessageId: null, notificationMode: "mentions", unreadCount: 0 }
    ]);

    await expect(repository.getStates(userId, [topicId, secondTopicId])).resolves.toEqual(
      new Map([
        [topicId, { unreadCount: 2, lastReadMessageId: newerId, notificationMode: "all" }],
        [secondTopicId, { unreadCount: 0, lastReadMessageId: null, notificationMode: "mentions" }]
      ])
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const unreadQuery = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(unreadQuery).toContain("topic_read.last_read_created_at");
    expect(unreadQuery).not.toContain("left join club_chat_messages read_message");
    expect(unreadQuery).toContain("group by topic_state.topic_id");
    expect(unreadQuery).toContain("candidate.user_id <>");
    expect(unreadQuery).toContain("candidate.is_system = false");
    expect(unreadQuery).toContain("candidate.status = 'visible'");
    expect(unreadQuery).toContain("candidate.deleted_by_user_at is null");
  });
});
