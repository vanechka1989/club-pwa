import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schemaDefinition from "../db/schema";
import { createMessageSearchRepository, decodeSearchCursor } from "./messageSearch";

const databaseUrl = process.env.COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL
  ?? process.env.COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;

const userId = "00000000-0000-4000-8000-000000000001";
const publicTopicId = "00000000-0000-4000-8000-000000000010";
const adminTopicId = "00000000-0000-4000-8000-000000000011";
const unpublishedTopicId = "00000000-0000-4000-8000-000000000012";
const timestamp = "2026-07-28T12:00:00.123456Z";

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("community message search with PostgreSQL", () => {
  const schemaName = `message_search_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let client: Sql;
  let repository: ReturnType<typeof createMessageSearchRepository>;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    client = postgres(schemaConnectionUrl(databaseUrl!, schemaName), { max: 1, onnotice: () => undefined });
    await client.unsafe(`
      create table users (
        id uuid primary key, telegram_id varchar(320) not null, email varchar(320),
        email_verified_at timestamptz, marketing_email_opt_out_at timestamptz,
        first_name varchar(128), username varchar(64), display_name varchar(20),
        display_name_changed_by_user_at timestamptz, photo_url text, avatar_object_key text,
        avatar_refreshed_at timestamptz, avatar_position_x integer not null default 50,
        avatar_position_y integer not null default 50, avatar_scale integer not null default 100,
        telegram_bot_status varchar(16) not null default 'unknown', telegram_bot_blocked_at timestamptz,
        telegram_bot_unblocked_at timestamptz, device_snapshot jsonb, device_snapshot_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table club_chat_topics (
        id uuid primary key, chat_id uuid not null, title varchar(180) not null, description text,
        is_pinned boolean not null default false, is_locked boolean not null default false,
        is_published boolean not null default true, is_admin_only boolean not null default false,
        archived_until timestamptz, created_by_user_id uuid, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table club_chat_messages (
        id uuid primary key, topic_id uuid not null, user_id uuid not null, reply_to_message_id uuid,
        body text not null, kind varchar(16) not null default 'text', is_system boolean not null default false,
        status text not null default 'visible', moderated_by_user_id uuid, moderated_at timestamptz,
        moderation_reason text, pinned_at timestamptz, pinned_by_user_id uuid, purge_at timestamptz,
        client_operation_id varchar(96), edited_at timestamptz, deleted_by_user_at timestamptz,
        deleted_content_expires_at timestamptz, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table club_message_attachments (
        message_id uuid not null, scan_status varchar(16) not null default 'ready', deleted_at timestamptz
      );
      create index club_chat_messages_search_idx on club_chat_messages
        using gin (to_tsvector('simple', coalesce(body, '')));
    `);
    const database = drizzle(client, { schema: schemaDefinition });
    repository = createMessageSearchRepository(database);
  }, 30_000);

  beforeEach(async () => {
    await client.unsafe("truncate club_message_attachments, club_chat_messages, club_chat_topics, users");
    await client`
      insert into users (id, telegram_id, first_name, username, display_name)
      values (${userId}, 'tg-1', 'Анна', 'anna', 'Анна')
    `;
    await client`
      insert into club_chat_topics (id, chat_id, title, is_published, is_admin_only) values
      (${publicTopicId}, '00000000-0000-4000-8000-000000000020', 'Общение', true, false),
      (${adminTopicId}, '00000000-0000-4000-8000-000000000020', 'Модераторы', true, true),
      (${unpublishedTopicId}, '00000000-0000-4000-8000-000000000020', 'Архив', false, false)
    `;
  });

  afterAll(async () => {
    await client?.end({ timeout: 1 });
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  async function insertMessage(input: {
    id: string;
    topicId?: string;
    body?: string;
    status?: string;
    deletedByUserAt?: string | null;
    createdAt?: string;
  }) {
    await client`
      insert into club_chat_messages (id, topic_id, user_id, body, status, deleted_by_user_at, created_at)
      values (
        ${input.id}, ${input.topicId ?? publicTopicId}, ${userId}, ${input.body ?? "needle"},
        ${input.status ?? "visible"}, ${input.deletedByUserAt ?? null}, ${input.createdAt ?? timestamp}
      )
    `;
  }

  it("caps a page at 50 and paginates every equal-timestamp match with the UUID tie-breaker", async () => {
    const ids = Array.from(
      { length: 52 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 101).padStart(12, "0")}`
    );
    for (const id of ids) await insertMessage({ id });

    const descendingIds = [...ids].reverse();
    const first = await repository.search({ query: "needle", limit: 50, role: "member" });
    expect(first.results.map((result) => result.messageId)).toEqual(descendingIds.slice(0, 50));
    expect(first.nextCursor).not.toBeNull();

    const second = await repository.search({
      query: "needle",
      limit: 50,
      role: "member",
      before: decodeSearchCursor(first.nextCursor!)!
    });
    expect(second.results.map((result) => result.messageId)).toEqual(descendingIds.slice(50));
    expect(second.nextCursor).toBeNull();
  });

  it("filters inaccessible and unsafe rows in SQL for members and moderators", async () => {
    const safeId = "00000000-0000-4000-8000-000000000201";
    const adminId = "00000000-0000-4000-8000-000000000202";
    const unpublishedId = "00000000-0000-4000-8000-000000000203";
    const hiddenId = "00000000-0000-4000-8000-000000000204";
    const deletedId = "00000000-0000-4000-8000-000000000205";
    const userDeletedId = "00000000-0000-4000-8000-000000000206";
    const quarantinedId = "00000000-0000-4000-8000-000000000207";
    const purgedId = "00000000-0000-4000-8000-000000000208";
    await insertMessage({ id: safeId });
    await insertMessage({ id: adminId, topicId: adminTopicId });
    await insertMessage({ id: unpublishedId, topicId: unpublishedTopicId });
    await insertMessage({ id: hiddenId, status: "hidden" });
    await insertMessage({ id: deletedId, status: "deleted" });
    await insertMessage({ id: userDeletedId, deletedByUserAt: "2026-07-28T12:01:00.000Z" });
    await insertMessage({ id: quarantinedId });
    await insertMessage({ id: purgedId });
    await client`insert into club_message_attachments (message_id, scan_status) values (${quarantinedId}, 'scanning')`;
    await client`delete from club_chat_messages where id = ${purgedId}`;

    const member = await repository.search({ query: "needle", limit: 50, role: "member" });
    expect(member.results.map((result) => result.messageId)).toEqual([safeId]);

    const moderator = await repository.search({ query: "needle", limit: 50, role: "admin" });
    expect(new Set(moderator.results.map((result) => result.messageId))).toEqual(
      new Set([safeId, adminId, unpublishedId])
    );
  });

  it("supports topic-scoped text, normalized author and special-character queries without injection", async () => {
    const publicId = "00000000-0000-4000-8000-000000000301";
    const otherId = "00000000-0000-4000-8000-000000000302";
    await insertMessage({ id: publicId, body: "Привет участникам" });
    await insertMessage({ id: otherId, topicId: adminTopicId, body: "Привет администраторам" });

    const text = await repository.search({ query: "Привет", topicId: publicTopicId, limit: 50, role: "admin" });
    expect(text.results.map((result) => result.messageId)).toEqual([publicId]);
    const author = await repository.search({ query: "Анна", limit: 50, role: "member" });
    expect(author.results.map((result) => result.messageId)).toEqual([publicId]);
    await expect(repository.search({ query: `%_\\ "Анна"`, limit: 50, role: "member" })).resolves.toBeDefined();
    const injected = await repository.search({ query: "' OR 1=1 --", limit: 50, role: "member" });
    expect(injected.results).toEqual([]);
  });

  it("loads exact safe context in deterministic tuple order and rejects unsafe targets", async () => {
    const ids = [
      "00000000-0000-4000-8000-000000000401",
      "00000000-0000-4000-8000-000000000402",
      "00000000-0000-4000-8000-000000000403",
      "00000000-0000-4000-8000-000000000404",
      "00000000-0000-4000-8000-000000000405"
    ];
    for (const id of ids) await insertMessage({ id });
    await insertMessage({ id: "00000000-0000-4000-8000-000000000406", status: "hidden" });

    const context = await repository.loadContext({
      topicId: publicTopicId,
      messageId: ids[2]!,
      before: 2,
      after: 2
    });
    expect(context?.messages.map((message) => message.id)).toEqual(ids);
    await expect(repository.loadContext({
      topicId: publicTopicId,
      messageId: "00000000-0000-4000-8000-000000000406",
      before: 2,
      after: 2
    })).resolves.toBeNull();
  });

  it("loads reply previews only from safe messages in the same topic", async () => {
    const visibleId = "00000000-0000-4000-8000-000000000501";
    const hiddenId = "00000000-0000-4000-8000-000000000502";
    const quarantinedId = "00000000-0000-4000-8000-000000000503";
    const otherTopicId = "00000000-0000-4000-8000-000000000504";
    await insertMessage({ id: visibleId });
    await insertMessage({ id: hiddenId, status: "hidden" });
    await insertMessage({ id: quarantinedId });
    await insertMessage({ id: otherTopicId, topicId: adminTopicId });
    await client`insert into club_message_attachments (message_id, scan_status) values (${quarantinedId}, 'rejected')`;

    await expect(repository.loadSafeReply({ topicId: publicTopicId, messageId: visibleId }))
      .resolves.toMatchObject({ id: visibleId });
    await expect(repository.loadSafeReply({ topicId: publicTopicId, messageId: hiddenId })).resolves.toBeNull();
    await expect(repository.loadSafeReply({ topicId: publicTopicId, messageId: quarantinedId })).resolves.toBeNull();
    await expect(repository.loadSafeReply({ topicId: publicTopicId, messageId: otherTopicId })).resolves.toBeNull();
  });
});
