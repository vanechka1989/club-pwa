import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveMessageMutationTestDatabaseUrl } from "../community/postgresTestGate";

type CommunityOutboxModule = typeof import("./communityOutbox");

const databaseUrl = resolveMessageMutationTestDatabaseUrl();
const integrationDescribe = databaseUrl ? describe : describe.skip;
const recipientId = "00000000-0000-4000-8000-000000000951";
const senderId = "00000000-0000-4000-8000-000000000952";
const topicId = "00000000-0000-4000-8000-000000000953";
const messageId = "00000000-0000-4000-8000-000000000954";

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("community notification revocation fencing with PostgreSQL", () => {
  const schemaName = `notification_outbox_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let client: Sql;
  let createCommunityNotificationOutboxRepository: CommunityOutboxModule["createCommunityNotificationOutboxRepository"];
  let enqueueCommunityNotificationsWithDependencies: CommunityOutboxModule["enqueueCommunityNotificationsWithDependencies"];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    ({
      createCommunityNotificationOutboxRepository,
      enqueueCommunityNotificationsWithDependencies
    } = await import("./communityOutbox"));
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    client = postgres(schemaConnectionUrl(databaseUrl!, schemaName), { max: 1, onnotice: () => undefined });
    await client.unsafe(`
      create table users (
        id uuid primary key, telegram_id text not null unique,
        community_access_version integer not null default 1,
        updated_at timestamptz not null default now()
      );
      create table admin_users (
        id uuid primary key default gen_random_uuid(), telegram_id text not null unique,
        is_active boolean not null default true, permissions jsonb not null default '[]'::jsonb
      );
      create table subscriptions (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
        status text not null, expires_at timestamptz, created_at timestamptz not null default now()
      );
      create table club_chat_topics (
        id uuid primary key, is_published boolean not null default true,
        is_admin_only boolean not null default false
      );
      create table club_chat_messages (
        id uuid primary key, topic_id uuid not null, status text not null default 'visible',
        deleted_by_user_at timestamptz
      );
      create table community_topic_notification_settings (
        user_id uuid not null, topic_id uuid not null, mode text not null default 'mentions',
        primary key (user_id, topic_id)
      );
      create table community_notification_outbox (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
        topic_id uuid not null, message_id uuid not null, access_version integer not null,
        reason text not null, title text not null, body text not null, push_url text not null,
        status text not null default 'pending', claim_id uuid, claimed_at timestamptz,
        attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
        last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        unique (user_id, message_id, reason)
      );
      create table app_notifications (
        id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
        kind text not null, title text not null, body text not null, source text, source_id uuid,
        community_topic_id uuid, community_access_version integer
      );
      create unique index app_notifications_community_delivery_idx
        on app_notifications(user_id, source, source_id)
        where source in ('community_reply','community_mention','community_all');
    `);
  }, 30_000);

  beforeEach(async () => {
    await client.unsafe(`truncate app_notifications, community_notification_outbox,
      community_topic_notification_settings, subscriptions, admin_users,
      club_chat_messages, club_chat_topics, users cascade`);
    await client`
      insert into users (id, telegram_id) values
      (${recipientId}, 'member@example.test'), (${senderId}, 'sender@example.test')
    `;
    await client`insert into club_chat_topics (id) values (${topicId})`;
    await client`insert into club_chat_messages (id, topic_id) values (${messageId}, ${topicId})`;
  });

  afterAll(async () => {
    await client?.end({ timeout: 1 });
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  async function enqueueAndClaim() {
    const database = drizzle(client);
    await enqueueCommunityNotificationsWithDependencies({
      messageId,
      topicId,
      topicTitle: "Закрытая тема",
      senderUserId: senderId,
      senderName: "Автор",
      replyUserId: null,
      mentionUserIds: [recipientId]
    }, { database: database as never, ownerTelegramId: "owner@example.test" });
    const repository = createCommunityNotificationOutboxRepository(database as never, async () => "owner@example.test");
    const [candidate] = await repository.claimBatch({ limit: 100 });
    expect(candidate).toBeDefined();
    return { repository, candidate: candidate! };
  }

  it("retracts a persisted notification when membership expires before push", async () => {
    await client`
      insert into subscriptions (user_id, status, expires_at)
      values (${recipientId}, 'active', clock_timestamp() + interval '1 day')
    `;
    const { repository, candidate } = await enqueueAndClaim();
    await expect(repository.persistIfAccessible(candidate)).resolves.toMatchObject({ notificationId: expect.any(String) });

    await client`update subscriptions set status = 'expired' where user_id = ${recipientId}`;
    await client`update users set community_access_version = community_access_version + 1 where id = ${recipientId}`;

    await expect(repository.isStillAccessible(candidate)).resolves.toBe(false);
    await repository.revoke(candidate);
    const [counts] = await client<{ notifications: number; outbox: number }[]>`
      select (select count(*)::int from app_notifications) notifications,
             (select count(*)::int from community_notification_outbox) outbox
    `;
    expect(counts).toEqual({ notifications: 0, outbox: 0 });
  });

  it("rejects an admin-only notification after community permission revocation", async () => {
    await client`update club_chat_topics set is_admin_only = true where id = ${topicId}`;
    await client`
      insert into admin_users (telegram_id, permissions)
      values ('member@example.test', '["community"]'::jsonb)
    `;
    const { repository, candidate } = await enqueueAndClaim();
    await expect(repository.persistIfAccessible(candidate)).resolves.toBeTruthy();

    await client`update admin_users set permissions = '[]'::jsonb where telegram_id = 'member@example.test'`;
    await client`update users set community_access_version = community_access_version + 1 where id = ${recipientId}`;
    await expect(repository.isStillAccessible(candidate)).resolves.toBe(false);
  });

  it("cascades pending outbox rows on account deletion", async () => {
    await client`
      insert into subscriptions (user_id, status, expires_at)
      values (${recipientId}, 'active', clock_timestamp() + interval '1 day')
    `;
    await enqueueAndClaim();
    await client`delete from users where id = ${recipientId}`;
    const [row] = await client<{ count: number }[]>`select count(*)::int count from community_notification_outbox`;
    expect(row?.count).toBe(0);
  });
});
