import { readFileSync } from "node:fs";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schemaDefinition from "../db/schema";
import { preciseCommunityMessageCreatedAtExtra } from "./messageTimestamp";
import { resolveCommunityIntegrationTestConfig, resolveMessageMutationTestDatabaseUrl } from "./postgresTestGate";

type ObjectDeletionModule = typeof import("./objectDeletionLedger");
type ObjectPublicationModule = typeof import("./objectPublication");

const databaseUrl = resolveMessageMutationTestDatabaseUrl();
const s3Config = resolveCommunityIntegrationTestConfig()?.s3;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const privacyFencingMigration = readFileSync(
  new URL("../../drizzle/0067_community_chat_privacy_fencing.sql", import.meta.url),
  "utf8"
);
const objectConvergenceMigration = readFileSync(
  new URL("../../drizzle/0068_community_object_convergence.sql", import.meta.url),
  "utf8"
);

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("durable object deletion ledger with PostgreSQL", () => {
  const schemaName = `object_ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const messageId = "00000000-0000-4000-8000-000000000901";
  const jobId = "00000000-0000-4000-8000-000000000902";
  let admin: Sql;
  let clientA: Sql;
  let clientB: Sql;
  let createRepository: ObjectDeletionModule["createCommunityObjectDeletionRepository"];
  let createCleanup: ObjectDeletionModule["createCommunityObjectDeletionCleanup"];
  let enqueueDeletionBatch: ObjectDeletionModule["enqueueCommunityMessageDeletionBatch"];
  let beginPublication: ObjectPublicationModule["beginCommunityObjectPublication"];
  let createPublicationCoordinator: ObjectPublicationModule["createCommunityObjectPublicationCoordinator"];
  let assertPublication: ObjectPublicationModule["assertCommunityObjectPublicationActive"];
  let commitPublication: ObjectPublicationModule["commitCommunityObjectPublication"];
  let s3: S3Client;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    ({
      createCommunityObjectDeletionRepository: createRepository,
      createCommunityObjectDeletionCleanup: createCleanup,
      enqueueCommunityMessageDeletionBatch: enqueueDeletionBatch
    } = await import("./objectDeletionLedger"));
    ({
      beginCommunityObjectPublication: beginPublication,
      createCommunityObjectPublicationCoordinator: createPublicationCoordinator,
      assertCommunityObjectPublicationActive: assertPublication,
      commitCommunityObjectPublication: commitPublication
    } = await import("./objectPublication"));
    s3 = new S3Client({
      endpoint: s3Config!.endpoint,
      region: s3Config!.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: s3Config!.accessKeyId,
        secretAccessKey: s3Config!.secretAccessKey
      }
    });
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    const url = schemaConnectionUrl(databaseUrl!, schemaName);
    clientA = postgres(url, { max: 1, onnotice: () => undefined });
    clientB = postgres(url, { max: 1, onnotice: () => undefined });
    await clientA.unsafe(`
      create table users (
        id uuid primary key, telegram_id text not null unique,
        updated_at timestamptz not null default now()
      );
      create table admin_users (
        id uuid primary key default gen_random_uuid(), telegram_id text not null unique,
        is_active boolean not null default true, permissions jsonb not null default '[]'::jsonb
      );
      create table subscriptions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        status text not null, expires_at timestamptz,
        created_at timestamptz not null default now()
      );
      create table club_chat_topics (
        id uuid primary key, is_published boolean not null default true,
        is_admin_only boolean not null default false
      );
      create table club_chat_messages (
        id uuid primary key,
        topic_id uuid not null references club_chat_topics(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        is_system boolean not null default false, status text not null default 'visible',
        purge_at timestamptz, body text not null default '',
        deleted_by_user_at timestamptz,
        deleted_content_expires_at timestamptz, deleted_cleanup_claim_id uuid,
        deleted_cleanup_claimed_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table club_message_attachments (
        id uuid primary key,
        message_id uuid not null references club_chat_messages(id) on delete cascade,
        object_key text not null, scan_status varchar(16) not null default 'ready',
        expires_at timestamptz, deleted_at timestamptz
      );
      create table club_message_mentions (message_id uuid not null);
      create table club_polls (id uuid primary key, message_id uuid not null);
      create table community_upload_manifests (
        id uuid primary key,
        user_id uuid not null references users(id) on delete cascade,
        attachment_id uuid references club_message_attachments(id) on delete set null,
        staging_object_key text not null, quarantine_object_key text, final_object_key text,
        status varchar(24) not null default 'ready',
        updated_at timestamptz not null default now()
      );
      create table community_media_candidates (
        id uuid primary key, manifest_id uuid not null,
        candidate_object_key text not null, final_object_key text not null,
        status varchar(32) not null default 'staged', updated_at timestamptz not null default now()
      );
      create table community_topic_reads (
        user_id uuid not null references users(id) on delete cascade,
        topic_id uuid not null references club_chat_topics(id) on delete cascade,
        last_read_message_id uuid references club_chat_messages(id) on delete set null,
        last_read_at timestamptz not null default now(),
        primary key (user_id, topic_id)
      );
      create table community_topic_notification_settings (
        user_id uuid not null, topic_id uuid not null,
        mode text not null default 'mentions', primary key (user_id, topic_id)
      );
      create table app_notifications (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        kind text not null default 'client', title text not null default '', body text not null default '',
        source varchar(64), source_id uuid, created_at timestamptz not null default now()
      );
    `);

    const legacyUserId = "00000000-0000-4000-8000-000000000890";
    const legacyTopicId = "00000000-0000-4000-8000-000000000891";
    const deletedReadId = "00000000-0000-4000-8000-000000000892";
    const notificationMessageId = "00000000-0000-4000-8000-000000000893";
    await clientA`
      insert into users (id, telegram_id) values (${legacyUserId}, 'legacy@example.test')
    `;
    await clientA`insert into club_chat_topics (id) values (${legacyTopicId})`;
    await clientA`
      insert into club_chat_messages (id, topic_id, user_id, created_at) values
      (${deletedReadId}, ${legacyTopicId}, ${legacyUserId}, '2026-07-29T10:00:00Z'),
      (${notificationMessageId}, ${legacyTopicId}, ${legacyUserId}, '2026-07-29T10:01:00Z')
    `;
    await clientA`
      insert into community_topic_reads (user_id, topic_id, last_read_message_id, last_read_at)
      values (${legacyUserId}, ${legacyTopicId}, ${deletedReadId}, '2026-07-29T10:02:00Z')
    `;
    await clientA`
      insert into app_notifications (user_id, source, source_id, created_at) values
      (${legacyUserId}, 'community_all', ${notificationMessageId}, '2026-07-29T10:03:00Z'),
      (${legacyUserId}, 'community_all', ${notificationMessageId}, '2026-07-29T10:04:00Z')
    `;
    await clientA`delete from club_chat_messages where id = ${deletedReadId}`;

    for (const statement of privacyFencingMigration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await clientA.unsafe(statement);
    }
    await clientA`
      insert into community_upload_manifests (
        id, user_id, staging_object_key, quarantine_object_key, final_object_key, status
      ) values
      (
        '00000000-0000-4000-8000-000000000894', ${legacyUserId},
        'migration/manifest/staging', 'migration/manifest/quarantine', 'migration/manifest/final', 'aborted'
      ),
      (
        '00000000-0000-4000-8000-000000000898', ${legacyUserId},
        'migration/active/staging', null, 'migration/candidate/live-final', 'ready'
      )
    `;
    await clientA`
      insert into community_media_candidates (
        id, manifest_id, candidate_object_key, final_object_key, status
      ) values
      (
        '00000000-0000-4000-8000-000000000895',
        '00000000-0000-4000-8000-000000000894',
        'migration/candidate/cleanup', 'migration/candidate/uncommitted-final', 'cleanup_pending'
      ),
      (
        '00000000-0000-4000-8000-000000000896',
        '00000000-0000-4000-8000-000000000898',
        'migration/candidate/published', 'migration/candidate/live-final', 'published'
      ),
      (
        '00000000-0000-4000-8000-000000000899',
        '00000000-0000-4000-8000-000000000894',
        'migration/candidate/parent-terminal', 'migration/candidate/parent-terminal-final', 'staged'
      )
    `;
    await clientA`
      insert into community_object_publications (source_type, source_id, object_key, state, quiesced_at)
      values (
        'manifest', '00000000-0000-4000-8000-000000000897',
        'migration/publication/quiescing', 'quiescing', clock_timestamp()
      )
    `;
    for (const statement of objectConvergenceMigration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await clientA.unsafe(statement);
    }
  }, 30_000);

  afterAll(async () => {
    s3?.destroy();
    await Promise.allSettled([clientA?.end({ timeout: 1 }), clientB?.end({ timeout: 1 })]);
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  async function resetData() {
    await clientA.unsafe(`
      truncate table
        community_object_publications,
        community_object_lifecycles,
        community_object_deletion_entries,
        community_object_deletion_jobs,
        community_message_purge_requests,
        community_notification_outbox,
        app_notifications,
        community_topic_notification_settings,
        community_topic_reads,
        community_media_candidates,
        community_upload_manifests,
        club_message_attachments,
        club_message_mentions,
        club_polls,
        club_chat_messages,
        subscriptions,
        admin_users,
        club_chat_topics,
        users
      cascade
    `);
  }

  async function listObjectVersions(bucket: string, key: string) {
    const objects: Array<{ Key: string; VersionId: string }> = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await s3.send(new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        ...(keyMarker ? { KeyMarker: keyMarker } : {}),
        ...(versionIdMarker ? { VersionIdMarker: versionIdMarker } : {})
      }));
      for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
        if (entry.Key === key && entry.VersionId) objects.push({ Key: entry.Key, VersionId: entry.VersionId });
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
    return objects;
  }

  async function removeEveryObjectVersion(bucket: string, key: string) {
    for (let pass = 0; pass < 4; pass += 1) {
      const objects = await listObjectVersions(bucket, key);
      if (!objects.length) return;
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    }
    throw new Error("versioned_test_deletion_did_not_converge");
  }

  it("applies the corrective migration, preserves legacy reads, deduplicates notifications, and fences finalization", async () => {
    const [migrationState] = await clientA<{ lastReadMessageId: string; lastReadCreatedAt: Date; notifications: number }[]>`
      select topic_read.last_read_message_id as "lastReadMessageId",
             topic_read.last_read_created_at as "lastReadCreatedAt",
             (select count(*)::int from app_notifications) notifications
      from community_topic_reads topic_read
    `;
    expect(migrationState).toMatchObject({
      lastReadMessageId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      notifications: 1
    });
    expect(migrationState?.lastReadCreatedAt.toISOString()).toBe("2026-07-29T10:02:00.000Z");
    await clientA`
      update community_topic_reads
      set last_read_message_id = '00000000-0000-4000-8000-000000000893',
          last_read_at = '2026-07-29T10:05:00Z'
    `;
    const [legacyUpdate] = await clientA<{ lastReadCreatedAt: Date }[]>`
      select last_read_created_at as "lastReadCreatedAt" from community_topic_reads
    `;
    expect(legacyUpdate?.lastReadCreatedAt.toISOString()).toBe("2026-07-29T10:01:00.000Z");
    const migrationTombstones = await clientA<{ objectKey: string }[]>`
      select object_key as "objectKey"
      from community_object_lifecycles
      where state = 'deleted' and object_key like 'migration/%'
      order by object_key
    `;
    expect(migrationTombstones.map((row) => row.objectKey)).toEqual([
      "migration/candidate/cleanup",
      "migration/candidate/parent-terminal",
      "migration/candidate/parent-terminal-final",
      "migration/candidate/published",
      "migration/candidate/uncommitted-final",
      "migration/manifest/final",
      "migration/manifest/quarantine",
      "migration/manifest/staging",
      "migration/publication/quiescing"
    ]);
    expect(migrationTombstones.map((row) => row.objectKey)).not.toContain("migration/candidate/live-final");
    await expect(clientA<{ count: number }[]>`
      select count(*)::int as count from community_object_publications
      where object_key = 'migration/publication/quiescing'
    `).resolves.toEqual([{ count: 0 }]);

    await resetData();
    const userId = "00000000-0000-4000-8000-000000000904";
    const topicId = "00000000-0000-4000-8000-000000000905";
    await clientA`insert into users (id, telegram_id) values (${userId}, 'cleanup@example.test')`;
    await clientA`insert into club_chat_topics (id) values (${topicId})`;
    await clientA`
      insert into club_chat_messages (id, topic_id, user_id, lifecycle_version, terminal_cleanup_at)
      values (${messageId}, ${topicId}, ${userId}, 3, clock_timestamp())
    `;
    await clientA`
      insert into community_object_deletion_jobs (
        id, source_type, source_id, action, expected_lifecycle_version
      ) values (${jobId}, 'message', ${messageId}, 'delete_message', 3)
    `;
    await clientA`
      insert into community_object_deletion_entries (job_id, object_key) values
      (${jobId}, 'community/quarantine/u/a.docx'),
      (${jobId}, 'community/final/u/a.docx')
    `;

    const repositoryA = createRepository(drizzle(clientA, { schema: schemaDefinition }), async () => ["primary"]);
    const repositoryB = createRepository(drizzle(clientB, { schema: schemaDefinition }), async () => ["primary"]);
    const first = await repositoryA.claimBatch({ limit: 100 });
    expect(first).toHaveLength(1);
    expect(first[0]?.objectKeys).toEqual([
      "community/final/u/a.docx",
      "community/quarantine/u/a.docx"
    ]);
    await expect(repositoryB.claimBatch({ limit: 100 })).resolves.toEqual([]);

    await repositoryA.release(first[0]!, "reserve unavailable");
    await clientA`update community_object_deletion_jobs set not_before = clock_timestamp()`;
    const retry = await repositoryB.claimBatch({ limit: 100 });
    await expect(repositoryB.finalize(retry[0]!)).resolves.toBe(true);

    const [counts] = await clientA<{ messages: number; jobs: number; entries: number }[]>`
      select (select count(*)::int from club_chat_messages) messages,
             (select count(*)::int from community_object_deletion_jobs) jobs,
             (select count(*)::int from community_object_deletion_entries) entries
    `;
    expect(counts).toEqual({ messages: 0, jobs: 0, entries: 0 });
  });

  it("materializes the named constraints and indexes declared by Drizzle metadata", async () => {
    const constraints = await clientA<{ name: string }[]>`
      select constraint_name as name
      from information_schema.table_constraints
      where table_schema = current_schema()
        and constraint_name in (
          'community_object_deletion_jobs_source_action_unique',
          'community_object_deletion_entries_job_key_unique',
          'community_object_publications_source_key_unique',
          'community_notification_outbox_delivery_unique'
        )
      order by constraint_name
    `;
    expect(constraints.map((row) => row.name)).toEqual([
      "community_notification_outbox_delivery_unique",
      "community_object_deletion_entries_job_key_unique",
      "community_object_deletion_jobs_source_action_unique",
      "community_object_publications_source_key_unique"
    ]);

    const indexes = await clientA<{ name: string }[]>`
      select indexname as name
      from pg_indexes
      where schemaname = current_schema()
        and indexname in (
          'app_notifications_community_access_idx',
          'app_notifications_community_delivery_idx',
          'club_chat_messages_terminal_cleanup_idx',
          'club_message_attachments_terminal_cleanup_idx',
          'community_message_purge_requests_key_idx',
          'community_object_publications_object_state_idx'
        )
      order by indexname
    `;
    expect(indexes.map((row) => row.name)).toEqual([
      "app_notifications_community_access_idx",
      "app_notifications_community_delivery_idx",
      "club_chat_messages_terminal_cleanup_idx",
      "club_message_attachments_terminal_cleanup_idx",
      "community_message_purge_requests_key_idx",
      "community_object_publications_object_state_idx"
    ]);
  });

  it("captures every attachment, manifest, and candidate key before an account cascade", async () => {
    await resetData();
    const userId = "00000000-0000-4000-8000-000000000910";
    const topicId = "00000000-0000-4000-8000-000000000911";
    const cascadeMessageId = "00000000-0000-4000-8000-000000000912";
    const attachmentId = "00000000-0000-4000-8000-000000000913";
    const manifestId = "00000000-0000-4000-8000-000000000914";
    const candidateId = "00000000-0000-4000-8000-000000000915";
    const expectedKeys = [
      "community/candidates/u/media.webp",
      "community/final/u/document.pdf",
      "community/final/u/media.webp",
      "community/pending/u/document.pdf",
      "community/quarantine/u/document.pdf"
    ];
    await clientA`insert into users (id, telegram_id) values (${userId}, 'cascade@example.test')`;
    await clientA`insert into club_chat_topics (id) values (${topicId})`;
    await clientA`
      insert into club_chat_messages (id, topic_id, user_id)
      values (${cascadeMessageId}, ${topicId}, ${userId})
    `;
    await clientA`
      insert into club_message_attachments (id, message_id, object_key)
      values (${attachmentId}, ${cascadeMessageId}, 'community/quarantine/u/document.pdf')
    `;
    await clientA`
      insert into community_upload_manifests (
        id, user_id, attachment_id, staging_object_key, quarantine_object_key, final_object_key
      ) values (
        ${manifestId}, ${userId}, ${attachmentId},
        'community/pending/u/document.pdf', 'community/quarantine/u/document.pdf',
        'community/final/u/document.pdf'
      )
    `;
    await clientA`
      insert into community_media_candidates (
        id, manifest_id, candidate_object_key, final_object_key
      ) values (
        ${candidateId}, ${manifestId},
        'community/candidates/u/media.webp', 'community/final/u/media.webp'
      )
    `;

    await clientA`delete from users where id = ${userId}`;
    const [sourceCounts] = await clientA<{ messages: number; attachments: number; manifests: number; candidates: number }[]>`
      select (select count(*)::int from club_chat_messages) messages,
             (select count(*)::int from club_message_attachments) attachments,
             (select count(*)::int from community_upload_manifests) manifests,
             (select count(*)::int from community_media_candidates) candidates
    `;
    expect(sourceCounts).toEqual({ messages: 0, attachments: 0, manifests: 0, candidates: 0 });
    const entries = await clientA<{ objectKey: string }[]>`
      select distinct object_key as "objectKey"
      from community_object_deletion_entries
      order by object_key
    `;
    expect(entries.map((entry) => entry.objectKey)).toEqual(expectedKeys);

    const deletedKeys: string[] = [];
    const cleanup = createCleanup({
      repository: createRepository(drizzle(clientA, { schema: schemaDefinition }), async () => ["primary"]),
      deleteObjectCopies: async (key) => { deletedKeys.push(key); },
      logger: { info: () => undefined, warn: () => undefined }
    });
    await cleanup();
    expect([...new Set(deletedKeys)].sort()).toEqual(expectedKeys);
    const [ledger] = await clientA<{ jobs: number; entries: number }[]>`
      select (select count(*)::int from community_object_deletion_jobs) jobs,
             (select count(*)::int from community_object_deletion_entries) entries
    `;
    expect(ledger).toEqual({ jobs: 0, entries: 0 });
  });

  it("rejects a publication commit and re-deletes provider writes that complete after the old grace window", async () => {
    await resetData();
    const userId = "00000000-0000-4000-8000-000000000930";
    const topicId = "00000000-0000-4000-8000-000000000931";
    const publicationMessageId = "00000000-0000-4000-8000-000000000932";
    const publicationJobId = "00000000-0000-4000-8000-000000000933";
    const sourceId = "00000000-0000-4000-8000-000000000934";
    const objectKey = `integration/community/final/${schemaName}/publication-race.webp`;
    await clientA`insert into users (id, telegram_id) values (${userId}, 'publication@example.test')`;
    await clientA`insert into club_chat_topics (id) values (${topicId})`;
    await clientA`
      insert into club_chat_messages (id, topic_id, user_id, lifecycle_version, terminal_cleanup_at)
      values (${publicationMessageId}, ${topicId}, ${userId}, 1, clock_timestamp())
    `;
    await clientA`
      insert into community_object_deletion_jobs (
        id, source_type, source_id, action, expected_lifecycle_version
      ) values (${publicationJobId}, 'message', ${publicationMessageId}, 'delete_message', 1)
    `;
    await clientA`
      insert into community_object_deletion_entries (job_id, object_key)
      values (${publicationJobId}, ${objectKey})
    `;

    const databaseA = drizzle(clientA, { schema: schemaDefinition });
    const databaseB = drizzle(clientB, { schema: schemaDefinition });
    const publication = await beginPublication({
      sourceType: "candidate",
      sourceId,
      objectKey,
      targets: ["primary", "reserve"]
    }, databaseA as never);
    let publicationWriting!: () => void;
    let releaseProviderWrite!: () => void;
    const writing = new Promise<void>((resolve) => { publicationWriting = resolve; });
    const release = new Promise<void>((resolve) => { releaseProviderWrite = resolve; });
    const events: string[] = [];
    const coordinator = createPublicationCoordinator({
      assertActive: (claim) => assertPublication(claim, databaseA as never),
      runIo: async (work) => work(new AbortController().signal),
      commitPublication: (claim, work) => commitPublication(claim, work, databaseA as never)
    });
    const publishing = coordinator({
      claim: publication,
      write: async () => {
        events.push("publisher:provider-write-started");
        publicationWriting();
        await release;
        for (const bucket of [s3Config!.bucket, s3Config!.reserveBucket]) {
          await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: new TextEncoder().encode(`late-${bucket}`),
            ContentType: "image/webp"
          }));
        }
        events.push("publisher:provider-write-completed");
      },
      commit: async () => { events.push("publisher:committed"); }
    }).then(() => null, (error: unknown) => error);
    await writing;
    await expect(clientA<{ ok: number }[]>`select 1::int as ok`).resolves.toEqual([{ ok: 1 }]);

    const cleanup = createCleanup({
      repository: createRepository(databaseB as never, async () => ["primary", "reserve"]),
      deleteObjectCopies: async (key) => {
        await Promise.all([
          removeEveryObjectVersion(s3Config!.bucket, key),
          removeEveryObjectVersion(s3Config!.reserveBucket, key)
        ]);
        events.push("deletion:object");
      },
      logger: { info: () => undefined, warn: () => undefined }
    });
    const cleanupResult = await cleanup();
    expect(cleanupResult.completedJobIds).toEqual([publicationJobId]);
    await clientA`
      update community_object_lifecycles
      set tombstoned_at = clock_timestamp() - interval '10 minutes',
          next_reconcile_at = clock_timestamp()
      where object_key = ${objectKey}
    `;
    releaseProviderWrite();
    const publicationError = await publishing;
    expect(publicationError).toBeInstanceOf(Error);
    expect((publicationError as Error).message).toBe("object_publication_claim_lost");
    expect(events).toEqual([
      "publisher:provider-write-started",
      "deletion:object",
      "publisher:provider-write-completed"
    ]);

    const lifecycle = await import("./objectLifecycle");
    const reconciler = lifecycle.createCommunityObjectTombstoneReconciler({
      repository: lifecycle.createCommunityObjectTombstoneRepository(databaseB as never),
      deleteTarget: (key, target) => removeEveryObjectVersion(
        target === "primary" ? s3Config!.bucket : s3Config!.reserveBucket,
        key
      )
    });
    await expect(reconciler({ limit: 2, objectKeys: [objectKey] })).resolves.toMatchObject({
      stableKeys: [], pendingKeys: [objectKey]
    });
    await clientA`
      update community_object_lifecycles
      set verified_at = clock_timestamp() - interval '2 seconds', next_reconcile_at = clock_timestamp()
      where object_key = ${objectKey}
    `;
    await expect(reconciler({ limit: 2, objectKeys: [objectKey] })).resolves.toMatchObject({
      stableKeys: [objectKey], pendingKeys: []
    });

    expect(await listObjectVersions(s3Config!.bucket, objectKey)).toEqual([]);
    expect(await listObjectVersions(s3Config!.reserveBucket, objectKey)).toEqual([]);
    const tombstones = await clientA<{ state: string }[]>`
      select state from community_object_lifecycles where object_key = ${objectKey} order by target
    `;
    expect(tombstones).toEqual([{ state: "deleted" }, { state: "deleted" }]);
    await expect(beginPublication({
      sourceType: "candidate",
      sourceId,
      objectKey,
      targets: ["primary", "reserve"]
    }, databaseA as never)).rejects.toThrow("object_publication_tombstoned");
  });

  it("keeps candidate, quarantine, final, and reserve tombstones convergent across late versions and delete markers", async () => {
    await resetData();
    const keys = [
      `integration/community/candidates/${schemaName}/late.webp`,
      `integration/community/quarantine/${schemaName}/late.webp`,
      `integration/community/final/${schemaName}/late.webp`
    ];
    const lifecycle = await import("./objectLifecycle");
    const database = drizzle(clientA, { schema: schemaDefinition });
    await database.transaction(async (transaction) => {
      await lifecycle.tombstoneCommunityObjectKeysInDatabase(
        keys,
        ["primary", "reserve"],
        transaction as never
      );
    });
    const reconciler = lifecycle.createCommunityObjectTombstoneReconciler({
      repository: lifecycle.createCommunityObjectTombstoneRepository(database as never),
      deleteTarget: (key, target) => removeEveryObjectVersion(
        target === "primary" ? s3Config!.bucket : s3Config!.reserveBucket,
        key
      )
    });

    for (const key of keys) {
      for (const bucket of [s3Config!.bucket, s3Config!.reserveBucket]) {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "v1" }));
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "v2" }));
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
    }
    await reconciler({ limit: keys.length * 2, objectKeys: keys });
    await clientA`
      update community_object_lifecycles
      set verified_at = clock_timestamp() - interval '2 seconds', next_reconcile_at = clock_timestamp()
      where object_key = any(${keys})
    `;
    await expect(reconciler({ limit: keys.length * 2, objectKeys: keys })).resolves.toMatchObject({
      stableKeys: keys.slice().sort(), pendingKeys: []
    });

    // Simulate detached provider work after the source/job/process is gone.
    for (const key of keys) {
      for (const bucket of [s3Config!.bucket, s3Config!.reserveBucket]) {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "late-v3" }));
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
    }
    await clientA`update community_object_lifecycles set next_reconcile_at = clock_timestamp() where object_key = any(${keys})`;
    await reconciler({ limit: keys.length * 2, objectKeys: keys });
    for (const key of keys) {
      expect(await listObjectVersions(s3Config!.bucket, key)).toEqual([]);
      expect(await listObjectVersions(s3Config!.reserveBucket, key)).toEqual([]);
    }
  });

  it("backfills every configured target for tombstones created before reserve awareness", async () => {
    await resetData();
    const objectKey = `integration/community/final/${schemaName}/historical-primary-only.webp`;
    await clientA`
      insert into community_object_lifecycles (
        object_key, target, generation, state, tombstoned_at, next_reconcile_at
      ) values (${objectKey}, 'primary', 4, 'deleted', clock_timestamp(), clock_timestamp())
    `;
    const lifecycle = await import("./objectLifecycle");
    const database = drizzle(clientA, { schema: schemaDefinition });
    await lifecycle.ensureCommunityObjectTombstoneTargetsInDatabase(
      ["primary", "reserve"],
      database as never
    );
    await clientA`
      update community_object_lifecycles
      set absence_count = 2, verified_at = clock_timestamp()
      where object_key = ${objectKey}
    `;
    await database.transaction(async (transaction) => {
      await lifecycle.tombstoneCommunityObjectKeysInDatabase(
        [objectKey],
        ["primary", "reserve"],
        transaction as never
      );
    });
    const rows = await clientA<{ target: string; generation: number; state: string; absenceCount: number }[]>`
      select target, generation, state, absence_count as "absenceCount"
      from community_object_lifecycles
      where object_key = ${objectKey}
      order by target
    `;
    expect(rows).toEqual([
      { target: "primary", generation: 5, state: "deleted", absenceCount: 0 },
      { target: "reserve", generation: 5, state: "deleted", absenceCount: 0 }
    ]);
  });

  it("preserves PostgreSQL microseconds and deterministic created_at/id ordering for admin message surfaces", async () => {
    await resetData();
    const userId = "00000000-0000-4000-8000-000000000950";
    const topicId = "00000000-0000-4000-8000-000000000951";
    await clientA`insert into users (id, telegram_id) values (${userId}, 'admin-timestamp@example.test')`;
    await clientA`insert into club_chat_topics (id) values (${topicId})`;
    await clientA`
      insert into club_chat_messages (id, topic_id, user_id, created_at) values
      ('00000000-0000-4000-8000-000000000952', ${topicId}, ${userId}, '2026-07-30T10:00:00.123456Z'),
      ('00000000-0000-4000-8000-000000000953', ${topicId}, ${userId}, '2026-07-30T10:00:00.123789Z'),
      ('00000000-0000-4000-8000-000000000954', ${topicId}, ${userId}, '2026-07-30T10:00:00.123789Z')
    `;
    const database = drizzle(clientA, { schema: schemaDefinition });
    const messages = await database.query.clubChatMessages.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
      extras: { preciseCreatedAt: preciseCommunityMessageCreatedAtExtra() }
    });
    expect(messages.map((message) => [message.id, message.preciseCreatedAt])).toEqual([
      ["00000000-0000-4000-8000-000000000954", "2026-07-30T10:00:00.123789Z"],
      ["00000000-0000-4000-8000-000000000953", "2026-07-30T10:00:00.123789Z"],
      ["00000000-0000-4000-8000-000000000952", "2026-07-30T10:00:00.123456Z"]
    ]);
  });

  it("turns an owner bulk deletion into bounded jobs plus a durable continuation intent", async () => {
    await resetData();
    const userId = "00000000-0000-4000-8000-000000000920";
    const topicId = "00000000-0000-4000-8000-000000000921";
    await clientA`insert into users (id, telegram_id) values (${userId}, 'bulk@example.test')`;
    await clientA`insert into club_chat_topics (id) values (${topicId})`;
    await clientA`
      insert into club_chat_messages (id, topic_id, user_id, created_at)
      select gen_random_uuid(), ${topicId}, ${userId}, clock_timestamp() + ordinal * interval '1 microsecond'
      from generate_series(1, 153) ordinal
    `;
    const database = drizzle(clientA, { schema: schemaDefinition });

    await expect(enqueueDeletionBatch({ topicId, includeSystem: true }, database as never)).resolves.toBe(100);
    const [firstPass] = await clientA<{ terminal: number; jobs: number; requests: number }[]>`
      select (select count(*)::int from club_chat_messages where terminal_cleanup_at is not null) terminal,
             (select count(*)::int from community_object_deletion_jobs) jobs,
             (select count(*)::int from community_message_purge_requests) requests
    `;
    expect(firstPass).toEqual({ terminal: 100, jobs: 100, requests: 1 });

    const [lockedMessage] = await clientA<{ id: string }[]>`
      select id from club_chat_messages where terminal_cleanup_at is null order by id limit 1
    `;
    let signalLocked!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const holdLock = clientB.begin(async (transaction) => {
      await transaction`select id from club_chat_messages where id = ${lockedMessage!.id} for update`;
      signalLocked();
      await new Promise<void>((resolve) => { releaseLock = resolve; });
    });
    await locked;
    await createRepository(database as never).enqueueDue({ limit: 100 });
    const [lockedPass] = await clientA<{ terminal: number; jobs: number; requests: number }[]>`
      select (select count(*)::int from club_chat_messages where terminal_cleanup_at is not null) terminal,
             (select count(*)::int from community_object_deletion_jobs) jobs,
             (select count(*)::int from community_message_purge_requests) requests
    `;
    expect(lockedPass).toEqual({ terminal: 152, jobs: 152, requests: 1 });
    releaseLock();
    await holdLock;

    await createRepository(database as never).enqueueDue({ limit: 100 });
    const [secondPass] = await clientA<{ terminal: number; jobs: number; requests: number }[]>`
      select (select count(*)::int from club_chat_messages where terminal_cleanup_at is not null) terminal,
             (select count(*)::int from community_object_deletion_jobs) jobs,
             (select count(*)::int from community_message_purge_requests) requests
    `;
    expect(secondPass).toEqual({ terminal: 153, jobs: 153, requests: 0 });
  });
});
