import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schemaDefinition from "../db/schema";
import type {
  createMessageMutationRepository as CreateMessageMutationRepository,
  createMessageMutationService as CreateMessageMutationService,
  MessageMutationRepository
} from "./messageMutationService";
import type { createAppNotificationService as CreateAppNotificationService } from "../notifications/create";
import { resolveMessageMutationTestDatabaseUrl } from "./postgresTestGate";

const databaseUrl = resolveMessageMutationTestDatabaseUrl();
const integrationDescribe = databaseUrl ? describe : describe.skip;

const userId = "00000000-0000-4000-8000-000000000001";
const topicId = "00000000-0000-4000-8000-000000000010";

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("message mutation idempotency with PostgreSQL", () => {
  const schemaName = `message_mutation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let clientA: Sql;
  let clientB: Sql;
  let createRepository: typeof CreateMessageMutationRepository;
  let createService: typeof CreateMessageMutationService;
  let createNotificationService: typeof CreateAppNotificationService;
  let serviceA: ReturnType<typeof CreateMessageMutationService>;
  let serviceB: ReturnType<typeof CreateMessageMutationService>;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    ({ createMessageMutationRepository: createRepository, createMessageMutationService: createService } =
      await import("./messageMutationService"));
    ({ createAppNotificationService: createNotificationService } = await import("../notifications/create"));
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    const url = schemaConnectionUrl(databaseUrl!, schemaName);
    clientA = postgres(url, { max: 1, onnotice: () => undefined });
    clientB = postgres(url, { max: 1, onnotice: () => undefined });
    await clientA.unsafe(`
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
        id uuid primary key default gen_random_uuid(), topic_id uuid not null, user_id uuid not null,
        reply_to_message_id uuid, body text not null, kind varchar(16) not null default 'text',
        is_system boolean not null default false, status text not null default 'visible',
        moderated_by_user_id uuid, moderated_at timestamptz, moderation_reason text,
        pinned_at timestamptz, pinned_by_user_id uuid, purge_at timestamptz,
        client_operation_id varchar(96), create_request_fingerprint varchar(64), edited_at timestamptz,
        deleted_by_user_at timestamptz, deleted_content_expires_at timestamptz,
        deleted_cleanup_claim_id uuid, deleted_cleanup_claimed_at timestamptz,
        created_at timestamptz not null default clock_timestamp(),
        updated_at timestamptz not null default clock_timestamp()
      );
      create unique index club_chat_messages_user_operation_idx
        on club_chat_messages (user_id, client_operation_id) where client_operation_id is not null;
      create table club_message_mentions (
        message_id uuid not null, user_id uuid not null, start_offset integer not null, end_offset integer not null,
        primary key (message_id, user_id)
      );
      create table club_message_attachments (
        id uuid primary key default gen_random_uuid(), message_id uuid not null,
        expires_at timestamptz, deleted_at timestamptz
      );
      create table community_topic_notification_settings (
        user_id uuid not null, topic_id uuid not null, mode varchar(16) not null default 'mentions',
        updated_at timestamptz not null default now(), primary key (user_id, topic_id)
      );
      create table app_notifications (
        id uuid primary key default gen_random_uuid(), user_id uuid not null,
        kind varchar(32) not null default 'system', title varchar(180) not null,
        body text not null, body_html text, source varchar(64), source_id uuid,
        attachment_kind varchar(16), attachment_file_name varchar(255),
        attachment_object_key text, attachment_content_type varchar(160),
        attachment_size_bytes integer, read_at timestamptz,
        created_at timestamptz not null default now()
      );
      create table community_notification_outbox (
        id uuid primary key default gen_random_uuid(), message_id uuid not null
      );
    `);

    const makeService = (client: Sql) => {
      const base = createRepository(drizzle(client, { schema: schemaDefinition }));
      const repository: MessageMutationRepository = {
        ...base,
        listNotificationCandidates: async () => [],
        enqueueNotifications: async () => undefined
      };
      return createService({
        repository,
        createNotification: async () => null,
        canUserAccessTopic: async () => true,
        publishChange: () => undefined
      });
    };
    serviceA = makeService(clientA);
    serviceB = makeService(clientB);
  }, 30_000);

  beforeEach(async () => {
    await clientA.unsafe("truncate community_notification_outbox, app_notifications, community_topic_notification_settings, club_message_attachments, club_message_mentions, club_chat_messages, club_chat_topics, users");
    await clientA`
      insert into users (id, telegram_id, first_name, display_name)
      values (${userId}, 'web:user', 'Иван', 'Иван')
    `;
    await clientA`
      insert into club_chat_topics (id, chat_id, title)
      values (${topicId}, '00000000-0000-4000-8000-000000000020', 'Общение')
    `;
  });

  afterAll(async () => {
    await Promise.allSettled([clientA?.end({ timeout: 1 }), clientB?.end({ timeout: 1 })]);
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  function input(body = "Привет") {
    return {
      topicId,
      userId,
      role: "member" as const,
      body,
      replyToMessageId: null,
      clientOperationId: "device:race",
      mentions: []
    };
  }

  it("returns one server-created row to simultaneous identical requests", async () => {
    const beforeRows = await clientA<{ now: Date }[]>`select clock_timestamp() as now`;
    const before = beforeRows[0]!.now;
    const results = await Promise.all([serviceA.createText(input()), serviceB.createText(input())]);
    const afterRows = await clientA<{ now: Date }[]>`select clock_timestamp() as now`;
    const after = afterRows[0]!.now;
    const rows = await clientA<{ id: string; createdAt: Date }[]>`
      select id, created_at as "createdAt" from club_chat_messages
    `;

    expect(results.map((result) => result.message.id)).toEqual([rows[0]!.id, rows[0]!.id]);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(rows[0]!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("keeps the winning payload and rejects a simultaneous conflicting reuse", async () => {
    const results = await Promise.allSettled([
      serviceA.createText(input("Первый")),
      serviceB.createText(input("Второй"))
    ]);
    const rows = await clientA<{ body: string }[]>`select body from club_chat_messages`;

    expect(rows).toHaveLength(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "operation_conflict", status: 409 } });
    expect(["Первый", "Второй"]).toContain(rows[0]!.body);
  });

  it("keeps the immutable create fingerprint after edit, deletion, and final purge", async () => {
    const original = input("Исходный текст");
    const first = await serviceA.createText(original);

    await clientA`
      update club_chat_messages
      set body = 'Исправленный текст', edited_at = clock_timestamp()
      where id = ${first.message.id}
    `;
    await expect(serviceB.createText(original)).resolves.toMatchObject({ created: false });
    await expect(serviceB.createText(input("Исправленный текст"))).rejects.toMatchObject({
      code: "operation_conflict",
      status: 409
    });

    await clientA`
      update club_chat_messages
      set body = '', deleted_by_user_at = clock_timestamp(), deleted_content_expires_at = null
      where id = ${first.message.id}
    `;
    await expect(serviceB.createText(original)).resolves.toMatchObject({ created: false });
    await expect(serviceB.createText(input(""))).rejects.toMatchObject({
      code: "operation_conflict",
      status: 409
    });
  });

  it("never holds the message lock while guarded push network delivery is active", async () => {
    const created = await serviceA.createText(input());
    const events: string[] = [];
    let releasePush!: () => void;
    let pushStarted!: () => void;
    const started = new Promise<void>((resolve) => { pushStarted = resolve; });
    const notificationService = createNotificationService({
      database: drizzle(clientA, { schema: schemaDefinition }),
      sendWebPushToUser: async () => {
        events.push("push-started");
        pushStarted();
        await new Promise<void>((resolve) => { releasePush = resolve; });
        events.push("push-finished");
        return { sent: 1, skipped: false };
      },
      logger: { warn: () => undefined }
    });
    const notificationInput = {
      userId,
      title: "Новое сообщение: Общение",
      body: "Новое сообщение в чате.",
      source: "community_all",
      sourceId: created.message.id,
      deduplicate: true
    } as const;
    const notification = notificationService(notificationInput, {
      activeCommunityMessageId: created.message.id
    });
    await started;

    const deletion = serviceB.deleteMessage({
      messageId: created.message.id,
      userId,
      role: "member"
    }).then((result) => {
      events.push("deletion-committed");
      return result;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await deletion;
    expect(events).toEqual(["push-started", "deletion-committed"]);

    releasePush();
    await notification;
    expect(events).toEqual(["push-started", "deletion-committed", "push-finished"]);

    await expect(notificationService(notificationInput, {
      activeCommunityMessageId: created.message.id
    })).resolves.toBeNull();
    const [remaining] = await clientA<{ count: number }[]>`
      select count(*)::int as count from app_notifications where source_id = ${created.message.id}
    `;
    expect(remaining?.count).toBe(0);
    expect(events).toEqual(["push-started", "deletion-committed", "push-finished"]);
  }, 10_000);

  it("starts attachment retention at author deletion instead of media creation", async () => {
    const created = await serviceA.createText(input());
    await clientA`
      insert into club_message_attachments (message_id, expires_at)
      values (${created.message.id}, clock_timestamp() + interval '29 days')
    `;

    const deleted = await serviceA.deleteMessage({
      messageId: created.message.id,
      userId,
      role: "member"
    });
    const [attachment] = await clientA<{ expiresAt: Date }[]>`
      select expires_at as "expiresAt" from club_message_attachments where message_id = ${created.message.id}
    `;

    expect(attachment?.expiresAt.getTime()).toBe(deleted.message.deletedContentExpiresAt?.getTime());
  });

  it("releases the message lock after an aborting push failure so author deletion can commit", async () => {
    const created = await serviceA.createText(input());
    const notificationService = createNotificationService({
      database: drizzle(clientA, { schema: schemaDefinition }),
      sendWebPushToUser: async () => {
        throw new Error("Socket timeout");
      },
      logger: { warn: () => undefined }
    });

    await expect(notificationService({
      userId,
      title: "Новое сообщение: Общение",
      body: "Новое сообщение в чате.",
      source: "community_all",
      sourceId: created.message.id,
      deduplicate: true
    }, {
      activeCommunityMessageId: created.message.id
    })).resolves.toMatchObject({ sourceId: created.message.id });

    await expect(serviceB.deleteMessage({
      messageId: created.message.id,
      userId,
      role: "member"
    })).resolves.toMatchObject({ message: { deletedByUserAt: expect.any(Date) } });
    const [remaining] = await clientA<{ count: number }[]>`
      select count(*)::int as count from app_notifications where source_id = ${created.message.id}
    `;
    expect(remaining?.count).toBe(0);
  }, 10_000);
});
