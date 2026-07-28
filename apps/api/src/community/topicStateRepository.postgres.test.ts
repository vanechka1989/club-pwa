import { setTimeout as delay } from "node:timers/promises";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { createTopicStateRepository as CreateTopicStateRepository } from "./topicStateRepository";

const databaseUrl = process.env.COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

const currentUserId = "00000000-0000-0000-0000-000000000001";
const otherUserId = "00000000-0000-0000-0000-000000000002";
const topicId = "00000000-0000-0000-0000-000000000010";
const otherTopicId = "00000000-0000-0000-0000-000000000011";
const oldMessageId = "00000000-0000-0000-0000-000000000100";
const lowerTieMessageId = "00000000-0000-0000-0000-000000000101";
const higherTieMessageId = "00000000-0000-0000-0000-000000000102";
const newerMessageId = "00000000-0000-0000-0000-000000000103";

type Repository = ReturnType<typeof CreateTopicStateRepository>;

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const dialect = new PgDialect();

type UnsafeSqlClient = Pick<Sql, "unsafe"> | Pick<TransactionSql, "unsafe">;

function postgresExecutor(client: UnsafeSqlClient) {
  return {
    execute(query: SQL) {
      const compiled = dialect.sqlToQuery(query);
      return client.unsafe(compiled.sql, compiled.params as never[]);
    }
  };
}

integrationDescribe("topic state repository with PostgreSQL", () => {
  const schema = `topic_state_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let clientA: Sql;
  let clientB: Sql;
  let createRepository: typeof CreateTopicStateRepository;
  let repositoryA: Repository;
  let repositoryB: Repository;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    ({ createTopicStateRepository: createRepository } = await import("./topicStateRepository"));

    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schema}"`);

    const connectionUrl = schemaConnectionUrl(databaseUrl!, schema);
    clientA = postgres(connectionUrl, { max: 1, onnotice: () => undefined });
    clientB = postgres(connectionUrl, { max: 1, onnotice: () => undefined });

    await clientA.unsafe(`
      create table club_chat_messages (
        id uuid primary key,
        topic_id uuid not null,
        user_id uuid not null,
        created_at timestamptz not null,
        is_system boolean not null default false,
        status text not null default 'visible',
        deleted_by_user_at timestamptz
      );
      create table community_topic_reads (
        user_id uuid not null,
        topic_id uuid not null,
        last_read_message_id uuid,
        last_read_at timestamptz not null default now(),
        primary key (user_id, topic_id)
      );
      create table community_topic_notification_settings (
        user_id uuid not null,
        topic_id uuid not null,
        mode varchar(16) not null default 'mentions',
        updated_at timestamptz not null default now(),
        primary key (user_id, topic_id),
        check (mode in ('all', 'mentions', 'off'))
      );
    `);

    repositoryA = createRepository(postgresExecutor(clientA));
    repositoryB = createRepository(postgresExecutor(clientB));
  }, 30_000);

  beforeEach(async () => {
    await clientA.unsafe(
      "truncate community_topic_notification_settings, community_topic_reads, club_chat_messages"
    );
  });

  afterAll(async () => {
    await Promise.allSettled([clientA?.end({ timeout: 1 }), clientB?.end({ timeout: 1 })]);
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schema}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  async function insertMessage(input: {
    id: string;
    topicId?: string;
    userId?: string;
    createdAt: string;
    isSystem?: boolean;
    status?: string;
    deletedByUserAt?: string | null;
  }) {
    await clientA`
      insert into club_chat_messages (
        id, topic_id, user_id, created_at, is_system, status, deleted_by_user_at
      ) values (
        ${input.id},
        ${input.topicId ?? topicId},
        ${input.userId ?? otherUserId},
        ${input.createdAt},
        ${input.isSystem ?? false},
        ${input.status ?? "visible"},
        ${input.deletedByUserAt ?? null}
      )
    `;
  }

  it("persists only forward read positions with timestamp and UUID ordering", async () => {
    await insertMessage({ id: oldMessageId, createdAt: "2026-07-28T11:59:00.000Z" });
    await insertMessage({ id: lowerTieMessageId, createdAt: "2026-07-28T12:00:00.000Z" });
    await insertMessage({ id: higherTieMessageId, createdAt: "2026-07-28T12:00:00.000Z" });
    await insertMessage({ id: newerMessageId, createdAt: "2026-07-28T12:01:00.000Z" });
    await insertMessage({ id: "00000000-0000-0000-0000-000000000104", topicId: otherTopicId, createdAt: "2026-07-28T12:02:00.000Z" });

    await expect(repositoryA.markRead({ userId: currentUserId, topicId, messageId: lowerTieMessageId })).resolves.toBe(lowerTieMessageId);
    await expect(repositoryA.markRead({ userId: currentUserId, topicId, messageId: oldMessageId })).resolves.toBe(lowerTieMessageId);
    await expect(repositoryA.markRead({ userId: currentUserId, topicId, messageId: higherTieMessageId })).resolves.toBe(higherTieMessageId);
    await expect(repositoryA.markRead({ userId: currentUserId, topicId, messageId: newerMessageId })).resolves.toBe(newerMessageId);
    await expect(repositoryA.markRead({ userId: currentUserId, topicId, messageId: "00000000-0000-0000-0000-000000000104" })).resolves.toBeNull();
    await expect(repositoryA.getReadMessageId(currentUserId, topicId)).resolves.toBe(newerMessageId);
  });

  it("excludes own, system, hidden, and user-deleted messages from unread", async () => {
    await insertMessage({ id: oldMessageId, createdAt: "2026-07-28T12:00:00.000Z" });
    await insertMessage({ id: "00000000-0000-0000-0000-000000000201", userId: currentUserId, createdAt: "2026-07-28T12:01:00.000Z" });
    await insertMessage({ id: "00000000-0000-0000-0000-000000000202", createdAt: "2026-07-28T12:02:00.000Z", isSystem: true });
    await insertMessage({ id: "00000000-0000-0000-0000-000000000203", createdAt: "2026-07-28T12:03:00.000Z", status: "hidden" });
    await insertMessage({ id: "00000000-0000-0000-0000-000000000204", createdAt: "2026-07-28T12:04:00.000Z", deletedByUserAt: "2026-07-28T12:05:00.000Z" });
    await insertMessage({ id: "00000000-0000-0000-0000-000000000205", createdAt: "2026-07-28T12:06:00.000Z" });
    await repositoryA.markRead({ userId: currentUserId, topicId, messageId: oldMessageId });

    await expect(repositoryA.getStates(currentUserId, [topicId, otherTopicId])).resolves.toEqual(
      new Map([
        [
          topicId,
          {
            unreadCount: 1,
            lastReadMessageId: oldMessageId,
            notificationMode: "mentions"
          }
        ],
        [
          otherTopicId,
          {
            unreadCount: 0,
            lastReadMessageId: null,
            notificationMode: "mentions"
          }
        ]
      ])
    );
  });

  async function runFirstWriteRace(firstMessageId: string, secondMessageId: string) {
    const firstInserted = deferred<string | null>();
    const releaseFirst = deferred();
    const first = clientA.begin(async (transaction) => {
      const transactionRepository = createRepository(postgresExecutor(transaction));
      const result = await transactionRepository.markRead({
        userId: currentUserId,
        topicId,
        messageId: firstMessageId
      });
      firstInserted.resolve(result);
      await releaseFirst.promise;
      return result;
    });

    await firstInserted.promise;
    let secondSettled = false;
    const second = repositoryB
      .markRead({ userId: currentUserId, topicId, messageId: secondMessageId })
      .then((result) => {
        secondSettled = true;
        return result;
      });

    await delay(50);
    expect(secondSettled).toBe(false);
    releaseFirst.resolve();

    return {
      firstResult: await first,
      secondResult: await second,
      stored: await repositoryA.getReadMessageId(currentUserId, topicId)
    };
  }

  it("returns the accepted position for concurrent duplicate first reads", async () => {
    await insertMessage({ id: newerMessageId, createdAt: "2026-07-28T12:01:00.000Z" });

    await expect(runFirstWriteRace(newerMessageId, newerMessageId)).resolves.toEqual({
      firstResult: newerMessageId,
      secondResult: newerMessageId,
      stored: newerMessageId
    });
  });

  it("returns the newer accepted position for concurrent older/newer first reads regardless of winner", async () => {
    await insertMessage({ id: oldMessageId, createdAt: "2026-07-28T12:00:00.000Z" });
    await insertMessage({ id: newerMessageId, createdAt: "2026-07-28T12:01:00.000Z" });

    await expect(runFirstWriteRace(newerMessageId, oldMessageId)).resolves.toEqual({
      firstResult: newerMessageId,
      secondResult: newerMessageId,
      stored: newerMessageId
    });

    await clientA`truncate community_topic_reads`;
    await expect(runFirstWriteRace(oldMessageId, newerMessageId)).resolves.toEqual({
      firstResult: oldMessageId,
      secondResult: newerMessageId,
      stored: newerMessageId
    });
  });

  it("returns read, notification, and unread state from one PostgreSQL statement snapshot", async () => {
    await insertMessage({ id: oldMessageId, createdAt: "2026-07-28T12:00:00.000Z" });
    await insertMessage({ id: newerMessageId, createdAt: "2026-07-28T12:01:00.000Z" });
    await repositoryA.markRead({ userId: currentUserId, topicId, messageId: oldMessageId });

    let statementCount = 0;
    const delayedRepository = createRepository({
      async execute(query) {
        statementCount += 1;
        const compiled = dialect.sqlToQuery(query);
        const delayedSql = compiled.sql
          .replace(
            "with requested(topic_id) as (",
            "with snapshot_pause as materialized (select pg_sleep(0.15)), requested(topic_id) as ("
          )
          .replace("from requested", "from requested cross join snapshot_pause");
        return clientA.unsafe(delayedSql, compiled.params as never[]);
      }
    });

    const stateBeforeCommit = delayedRepository.getState(currentUserId, topicId);
    await delay(50);
    await clientB.begin(async (transaction) => {
      await transaction`
        update community_topic_reads
        set last_read_message_id = ${newerMessageId}, last_read_at = now()
        where user_id = ${currentUserId} and topic_id = ${topicId}
      `;
      await transaction`
        insert into community_topic_notification_settings (user_id, topic_id, mode)
        values (${currentUserId}, ${topicId}, 'off')
      `;
    });

    await expect(stateBeforeCommit).resolves.toEqual({
      unreadCount: 1,
      lastReadMessageId: oldMessageId,
      notificationMode: "mentions"
    });
    expect(statementCount).toBe(1);
    await expect(repositoryA.getState(currentUserId, topicId)).resolves.toEqual({
      unreadCount: 0,
      lastReadMessageId: newerMessageId,
      notificationMode: "off"
    });
  });
});
