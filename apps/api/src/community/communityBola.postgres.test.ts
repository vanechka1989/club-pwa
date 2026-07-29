import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCommunityIntegrationTestConfig } from "./postgresTestGate";

const integrationConfig = resolveCommunityIntegrationTestConfig();
const databaseUrl = integrationConfig?.postgres.messageMutationDatabaseUrl;
const integrationDescribe = databaseUrl ? describe : describe.skip;

const ownerId = "00000000-0000-4000-8000-000000000001";
const requesterId = "00000000-0000-4000-8000-000000000002";
const privateTopicId = "00000000-0000-4000-8000-000000000010";
const publicTopicId = "00000000-0000-4000-8000-000000000011";
const messageId = "00000000-0000-4000-8000-000000000100";
const putUploadToken = "00000000-0000-4000-8000-000000000200";
const multipartUploadToken = "00000000-0000-4000-8000-000000000201";

const authState = vi.hoisted(() => ({ userId: "00000000-0000-4000-8000-000000000002" }));

vi.mock("../middleware/auth", () => ({
  telegramAuth: async (c: any, next: () => Promise<void>) => {
    c.set("telegramUser", { id: `web:${authState.userId}` });
    c.set("userId", authState.userId);
    c.set("previewRole", "member");
    c.set("previewMembershipStatus", "active");
    await next();
  }
}));
vi.mock("../security/persistentWriteRateLimit", () => ({
  persistentWriteRateLimit: async (_c: unknown, next: () => Promise<void>) => next()
}));
vi.mock("../security/persistentCommunityReadRateLimit", () => ({
  persistentCommunityReadRateLimit: async (_c: unknown, next: () => Promise<void>) => next()
}));
vi.mock("../admin/roles", () => ({
  getUserRole: vi.fn(async () => "member"),
  hasAdminPermission: vi.fn(async () => false),
  isOwnerTelegramId: vi.fn(async () => false)
}));
vi.mock("../moderation/mutes", () => ({ getActiveMute: vi.fn(async () => null) }));
vi.mock("../community/realtime", () => ({
  publishCommunityChange: vi.fn(),
  subscribeToCommunityChanges: vi.fn(() => () => undefined)
}));
vi.mock("../notifications/create", () => ({ createAppNotification: vi.fn(async () => null) }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../storage/s3", () => ({
  abortMultipartUpload: vi.fn(),
  completeMultipartUpload: vi.fn(),
  createMultipartPartUploadUrl: vi.fn(),
  createMultipartUpload: vi.fn(),
  createObjectUploadUrl: vi.fn(),
  deleteObject: vi.fn(),
  deleteObjectCopies: vi.fn(),
  downloadObjectPrefix: vi.fn(),
  downloadObjectRange: vi.fn(),
  getObjectMetadata: vi.fn(),
  getObjectReadUrl: vi.fn(),
  listMultipartUploadParts: vi.fn(),
  mirrorObjectToReserve: vi.fn(),
  promoteObjectVersion: vi.fn(),
  uploadObject: vi.fn()
}));

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("community route BOLA enforcement with PostgreSQL", () => {
  const schemaName = `community_bola_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let admin: Sql;
  let client: Sql;
  let communityRoute: Awaited<typeof import("../routes/community")>["communityRoute"];
  let postgresClient: Awaited<typeof import("../db/client")>["postgresClient"];

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    const isolatedUrl = schemaConnectionUrl(databaseUrl!, schemaName);
    process.env.DATABASE_URL = isolatedUrl;
    client = postgres(isolatedUrl, { max: 1, onnotice: () => undefined });
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
      create table club_message_mentions (
        message_id uuid not null, user_id uuid not null, start_offset integer not null, end_offset integer not null,
        primary key (message_id, user_id)
      );
      create table community_upload_manifests (
        id uuid primary key default gen_random_uuid(), user_id uuid not null, upload_token uuid not null unique,
        request_fingerprint varchar(64) not null, kind varchar(16) not null, upload_type varchar(16) not null,
        staging_object_key text not null, quarantine_object_key text, final_object_key text,
        multipart_upload_id text, expected_part_count integer, part_size_bytes integer,
        file_name varchar(255) not null, content_type varchar(160) not null, size_bytes integer not null,
        duration_seconds integer, width integer, height integer, result jsonb,
        status varchar(24) not null default 'uploading', error_code varchar(160), attachment_id uuid,
        expires_at timestamptz not null, completed_at timestamptz, consumed_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
    `);
    ({ communityRoute } = await import("../routes/community"));
    ({ postgresClient } = await import("../db/client"));
  }, 30_000);

  beforeEach(async () => {
    authState.userId = requesterId;
    await client.unsafe("truncate community_upload_manifests, club_message_mentions, club_chat_messages, club_chat_topics, users");
    await client`
      insert into users (id, telegram_id, first_name, display_name)
      values
        (${ownerId}, 'web:owner', 'Владелец', 'Владелец'),
        (${requesterId}, 'web:requester', 'Чужой', 'Чужой')
    `;
    await client`
      insert into club_chat_topics (id, chat_id, title, is_admin_only)
      values
        (${privateTopicId}, '00000000-0000-4000-8000-000000000020', 'Закрытая', true),
        (${publicTopicId}, '00000000-0000-4000-8000-000000000020', 'Общая', false)
    `;
    await client`
      insert into club_chat_messages (id, topic_id, user_id, body)
      values (${messageId}, ${publicTopicId}, ${ownerId}, 'Секрет владельца')
    `;
    await client`
      insert into community_upload_manifests (
        user_id, upload_token, request_fingerprint, kind, upload_type, staging_object_key,
        multipart_upload_id, expected_part_count, part_size_bytes, file_name, content_type,
        size_bytes, expires_at
      ) values
        (${ownerId}, ${putUploadToken}, 'put-fingerprint', 'video', 'put',
          'community/pending/owner/put.mp4', null, null, null, 'put.mp4', 'video/mp4', 1024,
          now() + interval '1 hour'),
        (${ownerId}, ${multipartUploadToken}, 'multipart-fingerprint', 'video', 'multipart',
          'community/pending/owner/multipart.mp4', 'multipart-1', 1, 8388608,
          'multipart.mp4', 'video/mp4', 1024, now() + interval '1 hour')
    `;
  });

  afterAll(async () => {
    await Promise.allSettled([
      client?.end({ timeout: 1 }),
      postgresClient?.end({ timeout: 1 })
    ]);
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("hides a member-inaccessible topic through the real route predicate", async () => {
    const response = await communityRoute.request(`/topics/${privateTopicId}/messages`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Topic not found" });
  });

  it("rejects editing and deleting another user's message without mutating it", async () => {
    const edit = await communityRoute.request(`/messages/${messageId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Украдено", mentions: [] })
    });
    const remove = await communityRoute.request(`/messages/${messageId}`, { method: "DELETE" });

    expect(edit.status).toBe(403);
    expect(remove.status).toBe(403);
    await expect(edit.json()).resolves.toMatchObject({ code: "not_message_author" });
    await expect(remove.json()).resolves.toMatchObject({ code: "not_message_author" });
    const rows = await client<{ body: string; editedAt: Date | null; deletedAt: Date | null }[]>`
      select body, edited_at as "editedAt", deleted_by_user_at as "deletedAt"
      from club_chat_messages where id = ${messageId}
    `;
    expect(rows).toEqual([{ body: "Секрет владельца", editedAt: null, deletedAt: null }]);
  });

  it("rejects foreign PUT, multipart, and refresh upload tokens before storage access", async () => {
    const put = await communityRoute.request("/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadToken: putUploadToken })
    });
    const multipart = await communityRoute.request("/uploads/multipart/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadToken: multipartUploadToken, parts: [{ partNumber: 1, etag: "etag-1" }] })
    });
    const refresh = await communityRoute.request(`/uploads/${putUploadToken}/refresh`, { method: "POST" });

    expect([put.status, multipart.status, refresh.status]).toEqual([403, 403, 403]);
    await expect(put.json()).resolves.toEqual({ error: "foreign_object" });
    await expect(multipart.json()).resolves.toEqual({ error: "foreign_object" });
    await expect(refresh.json()).resolves.toEqual({ error: "foreign_object" });
    const rows = await client<{ status: string; completedAt: Date | null; updatedAt: Date }[]>`
      select status, completed_at as "completedAt", updated_at as "updatedAt"
      from community_upload_manifests order by upload_token
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "uploading" && row.completedAt === null)).toBe(true);
  });
});
