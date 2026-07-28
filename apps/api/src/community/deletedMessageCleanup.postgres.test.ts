import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schemaDefinition from "../db/schema";
import type { createDeletedMessageCleanupRepository as CreateDeletedMessageCleanupRepository } from "./deletedMessageCleanup";
import { resolveMessageMutationTestDatabaseUrl } from "./postgresTestGate";

const databaseUrl = resolveMessageMutationTestDatabaseUrl();
const integrationDescribe = databaseUrl ? describe : describe.skip;

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("deleted message cleanup claims with PostgreSQL", () => {
  const schemaName = `deleted_cleanup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const messageId = "00000000-0000-4000-8000-000000000100";
  let admin: Sql;
  let clientA: Sql;
  let clientB: Sql;
  let createRepository: typeof CreateDeletedMessageCleanupRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    ({ createDeletedMessageCleanupRepository: createRepository } = await import("./deletedMessageCleanup"));
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    const url = schemaConnectionUrl(databaseUrl!, schemaName);
    clientA = postgres(url, { max: 1, onnotice: () => undefined });
    clientB = postgres(url, { max: 1, onnotice: () => undefined });
    await clientA.unsafe(`
      create table club_chat_messages (
        id uuid primary key, body text not null, create_request_fingerprint varchar(64),
        deleted_by_user_at timestamptz, deleted_content_expires_at timestamptz,
        deleted_cleanup_claim_id uuid, deleted_cleanup_claimed_at timestamptz,
        updated_at timestamptz not null default clock_timestamp()
      );
      create table club_message_attachments (
        id uuid primary key, message_id uuid not null, kind varchar(16) not null,
        object_key text not null, file_name varchar(255), content_type varchar(160) not null,
        size_bytes integer not null, duration_seconds integer, width integer, height integer,
        sort_order integer not null default 0, expires_at timestamptz, deleted_at timestamptz,
        scan_status varchar(16) not null default 'ready', scanned_at timestamptz,
        scan_error varchar(160), created_at timestamptz not null default now()
      );
      create table club_message_mentions (
        message_id uuid not null, user_id uuid not null, start_offset integer not null, end_offset integer not null
      );
      create table club_polls (id uuid primary key, message_id uuid not null);
      create table app_notifications (id uuid primary key, source varchar(64), source_id uuid);
    `);
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([clientA?.end({ timeout: 1 }), clientB?.end({ timeout: 1 })]);
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  it("claims once, releases for retry, and conditionally finalizes all database content", async () => {
    await clientA`
      insert into club_chat_messages (
        id, body, create_request_fingerprint, deleted_by_user_at, deleted_content_expires_at
      ) values (
        ${messageId}, 'retained secret', ${"a".repeat(64)}, clock_timestamp() - interval '31 days',
        clock_timestamp() - interval '1 day'
      )
    `;
    await clientA`
      insert into club_message_attachments (
        id, message_id, kind, object_key, content_type, size_bytes, deleted_at
      ) values (
        '00000000-0000-4000-8000-000000000201', ${messageId}, 'image',
        'community/a.webp', 'image/webp', 10, clock_timestamp() - interval '1 hour'
      )
    `;
    await clientA`
      insert into club_message_mentions (message_id, user_id, start_offset, end_offset)
      values (${messageId}, '00000000-0000-4000-8000-000000000001', 0, 5)
    `;
    await clientA`
      insert into club_polls (id, message_id)
      values ('00000000-0000-4000-8000-000000000202', ${messageId})
    `;
    await clientA`
      insert into app_notifications (id, source, source_id)
      values ('00000000-0000-4000-8000-000000000203', 'community_mention', ${messageId})
    `;

    const repositoryA = createRepository(drizzle(clientA, { schema: schemaDefinition }));
    const repositoryB = createRepository(drizzle(clientB, { schema: schemaDefinition }));
    const firstClaim = await repositoryA.claimBatch({ limit: 100 });
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]?.attachments).toEqual([{
      id: "00000000-0000-4000-8000-000000000201",
      objectKey: "community/a.webp"
    }]);
    await expect(repositoryB.claimBatch({ limit: 100 })).resolves.toEqual([]);

    await repositoryA.release(firstClaim[0]!);
    const retryClaim = await repositoryB.claimBatch({ limit: 100 });
    expect(retryClaim).toHaveLength(1);
    await expect(repositoryB.finalize(retryClaim[0]!)).resolves.toBe(true);

    const [message] = await clientA<{
      body: string;
      fingerprint: string;
      expiresAt: Date | null;
      claimId: string | null;
    }[]>`
      select body, create_request_fingerprint as fingerprint,
             deleted_content_expires_at as "expiresAt", deleted_cleanup_claim_id as "claimId"
      from club_chat_messages where id = ${messageId}
    `;
    const [attachment] = await clientA<{ scanStatus: string; deletedAt: Date | null }[]>`
      select scan_status as "scanStatus", deleted_at as "deletedAt"
      from club_message_attachments where message_id = ${messageId}
    `;
    const [counts] = await clientA<{ mentions: number; polls: number; notifications: number }[]>`
      select
        (select count(*)::int from club_message_mentions) as mentions,
        (select count(*)::int from club_polls) as polls,
        (select count(*)::int from app_notifications) as notifications
    `;

    expect(message).toEqual({ body: "", fingerprint: "a".repeat(64), expiresAt: null, claimId: null });
    expect(attachment?.scanStatus).toBe("deleted");
    expect(attachment?.deletedAt).toBeInstanceOf(Date);
    expect(counts).toEqual({ mentions: 0, polls: 0, notifications: 0 });
  });
});
