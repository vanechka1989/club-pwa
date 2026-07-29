import { existsSync, readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";
import {
  appNotifications,
  clubChatMessages,
  clubMessageAttachments,
  clubMessageMentions,
  communityMediaCandidates,
  communityMessagePurgeRequests,
  communityNotificationOutbox,
  communityObjectDeletionEntries,
  communityObjectDeletionJobs,
  communityObjectLifecycles,
  communityObjectPublications,
  communityUploadManifests,
  communityTopicNotificationSettings,
  communityTopicReads,
  users
} from "./schema";

const migration = readFileSync(new URL("../../drizzle/0063_reliable_community_chat.sql", import.meta.url), "utf8");
const reliabilityMigration = readFileSync(new URL("../../drizzle/0064_community_message_reliability.sql", import.meta.url), "utf8");
const uploadManifestMigration = readFileSync(new URL("../../drizzle/0065_community_upload_manifests.sql", import.meta.url), "utf8");
const mediaCandidateMigration = readFileSync(new URL("../../drizzle/0066_community_media_candidates.sql", import.meta.url), "utf8");
const privacyFencingMigration = readFileSync(new URL("../../drizzle/0067_community_chat_privacy_fencing.sql", import.meta.url), "utf8");
const convergentDeletionMigration = readFileSync(new URL("../../drizzle/0068_community_object_convergence.sql", import.meta.url), "utf8");
const hotQueueMigrationUrl = new URL("../../drizzle/0069_community_object_hot_queue.sql", import.meta.url);

const foreignKeys = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((key) => {
    const reference = key.reference();
    return {
      columns: reference.columns.map((column) => column.name),
      foreignTable: getTableName(reference.foreignTable),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      onDelete: key.onDelete
    };
  });

describe("reliable community chat Drizzle metadata", () => {
  it("keeps an immutable read tuple after the referenced message is hard-deleted", () => {
    const config = getTableConfig(communityTopicReads);

    expect(config.name).toBe("community_topic_reads");
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(["user_id", "topic_id"]);
    expect(foreignKeys(communityTopicReads)).toEqual([
      { columns: ["user_id"], foreignTable: "users", foreignColumns: ["id"], onDelete: "cascade" },
      { columns: ["topic_id"], foreignTable: "club_chat_topics", foreignColumns: ["id"], onDelete: "cascade" }
    ]);
    expect(communityTopicReads.lastReadMessageId.notNull).toBe(true);
    expect(communityTopicReads.lastReadCreatedAt.notNull).toBe(true);
    expect(communityTopicReads.lastReadAt.notNull).toBe(true);
    expect(communityTopicReads.lastReadAt.hasDefault).toBe(true);
  });

  it("constrains notification modes and attachment scan states", () => {
    const notificationConfig = getTableConfig(communityTopicNotificationSettings);
    const attachmentConfig = getTableConfig(clubMessageAttachments);

    expect(communityTopicNotificationSettings.mode.default).toBe("mentions");
    expect(notificationConfig.checks.map((item) => item.name)).toContain("community_topic_notification_settings_mode_check");
    expect(clubMessageAttachments.scanStatus.default).toBe("ready");
    expect(clubMessageAttachments.scanStatus.notNull).toBe(true);
    expect(attachmentConfig.checks.map((item) => item.name)).toContain("club_message_attachments_scan_status_check");
    expect(attachmentConfig.indexes.find((item) => item.config.name === "club_message_attachments_object_key_idx")?.config.unique).toBe(true);
  });

  it("models mentions and reliable message indexes", () => {
    const mentionConfig = getTableConfig(clubMessageMentions);
    const messageConfig = getTableConfig(clubChatMessages);
    const operationIndex = messageConfig.indexes.find((item) => item.config.name === "club_chat_messages_user_operation_idx");
    const searchIndex = messageConfig.indexes.find((item) => item.config.name === "club_chat_messages_search_idx");

    expect(mentionConfig.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(["message_id", "user_id"]);
    expect(foreignKeys(clubMessageMentions)).toEqual(
      expect.arrayContaining([
        { columns: ["message_id"], foreignTable: "club_chat_messages", foreignColumns: ["id"], onDelete: "cascade" },
        { columns: ["user_id"], foreignTable: "users", foreignColumns: ["id"], onDelete: "cascade" }
      ])
    );
    expect(operationIndex?.config.unique).toBe(true);
    expect(operationIndex?.config.columns.map((column) => "name" in column ? column.name : null)).toEqual([
      "user_id",
      "client_operation_id"
    ]);
    expect(operationIndex?.config.where).toBeDefined();
    expect(searchIndex?.config.method).toBe("gin");
    expect(messageConfig.indexes.map((item) => item.config.name)).toContain("club_chat_messages_deleted_expiry_idx");
    expect(clubChatMessages.createRequestFingerprint.dataType).toBe("string");
    expect(clubChatMessages.createRequestFingerprint.columnType).toBe("PgVarchar");
    expect(messageConfig.indexes.map((item) => item.config.name)).toContain("club_chat_messages_deleted_cleanup_idx");
  });

  it("durably records authoritative community upload lifecycle and ownership", () => {
    const config = getTableConfig(communityUploadManifests);
    expect(config.name).toBe("community_upload_manifests");
    expect(foreignKeys(communityUploadManifests)).toEqual(expect.arrayContaining([
      { columns: ["user_id"], foreignTable: "users", foreignColumns: ["id"], onDelete: "cascade" },
      { columns: ["attachment_id"], foreignTable: "club_message_attachments", foreignColumns: ["id"], onDelete: "set null" }
    ]));
    expect(config.indexes.find((item) => item.config.name === "community_upload_manifests_token_idx")?.config.unique).toBe(true);
    expect(config.checks.map((item) => item.name)).toContain("community_upload_manifests_status_check");
  });

  it("tracks lease-unique media candidates for retryable publication and cleanup", () => {
    const config = getTableConfig(communityMediaCandidates);
    expect(config.name).toBe("community_media_candidates");
    expect(config.indexes.find((item) => item.config.name === "community_media_candidates_manifest_lease_idx")?.config.unique).toBe(true);
    expect(config.indexes.find((item) => item.config.name === "community_media_candidates_candidate_key_idx")?.config.unique).toBe(true);
    expect(config.indexes.find((item) => item.config.name === "community_media_candidates_final_key_idx")?.config.unique).toBe(true);
    expect(config.checks.map((item) => item.name)).toContain("community_media_candidates_status_check");
  });

  it("models source-independent object deletion jobs and bounded purge intents", () => {
    const jobConfig = getTableConfig(communityObjectDeletionJobs);
    const entryConfig = getTableConfig(communityObjectDeletionEntries);
    const requestConfig = getTableConfig(communityMessagePurgeRequests);

    expect(jobConfig.checks.map((item) => item.name)).toEqual(expect.arrayContaining([
      "community_object_deletion_jobs_status_check",
      "community_object_deletion_jobs_action_check"
    ]));
    expect(jobConfig.uniqueConstraints.map((item) => item.name)).toContain(
      "community_object_deletion_jobs_source_action_unique"
    );
    expect(entryConfig.uniqueConstraints.map((item) => item.name)).toContain(
      "community_object_deletion_entries_job_key_unique"
    );
    expect(foreignKeys(communityObjectDeletionEntries)).toContainEqual({
      columns: ["job_id"],
      foreignTable: "community_object_deletion_jobs",
      foreignColumns: ["id"],
      onDelete: "cascade"
    });
    expect(requestConfig.indexes.find((item) => item.config.name === "community_message_purge_requests_key_idx")?.config.unique).toBe(true);
    const publicationConfig = getTableConfig(communityObjectPublications);
    expect(publicationConfig.uniqueConstraints.map((item) => item.name)).toContain(
      "community_object_publications_source_key_unique"
    );
    expect(publicationConfig.indexes.map((item) => item.config.name)).toContain(
      "community_object_publications_object_state_idx"
    );
    expect(publicationConfig.indexes.map((item) => item.config.name)).toContain(
      "community_object_publications_attachment_stale_idx"
    );
    const lifecycleConfig = getTableConfig(communityObjectLifecycles);
    expect(lifecycleConfig.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(["object_key", "target"]);
    expect(lifecycleConfig.checks.map((item) => item.name)).toEqual(expect.arrayContaining([
      "community_object_lifecycles_target_check",
      "community_object_lifecycles_state_check"
    ]));
    expect(lifecycleConfig.indexes.map((item) => item.config.name)).toContain(
      "community_object_lifecycles_reconcile_idx"
    );
    expect(communityObjectLifecycles.hotUntil.dataType).toBe("date");
    expect(communityObjectLifecycles.coldAt.dataType).toBe("date");
    expect(lifecycleConfig.indexes.map((item) => item.config.name)).toContain(
      "community_object_lifecycles_hot_due_idx"
    );
  });

  it("versions community access and persists revocation-aware notification delivery", () => {
    const outboxConfig = getTableConfig(communityNotificationOutbox);
    const notificationConfig = getTableConfig(appNotifications);

    expect(users.communityAccessVersion.notNull).toBe(true);
    expect(users.communityAccessVersion.default).toBe(1);
    expect(appNotifications.communityTopicId.dataType).toBe("string");
    expect(appNotifications.communityAccessVersion.dataType).toBe("number");
    expect(outboxConfig.uniqueConstraints.map((item) => item.name)).toContain(
      "community_notification_outbox_delivery_unique"
    );
    expect(notificationConfig.indexes.map((item) => item.config.name)).toEqual(expect.arrayContaining([
      "app_notifications_community_access_idx",
      "app_notifications_community_delivery_idx"
    ]));
    expect(notificationConfig.indexes
      .filter((item) => item.config.name?.startsWith("app_notifications_community_"))
      .every((item) => item.config.where !== undefined)).toBe(true);
    expect(outboxConfig.checks.map((item) => item.name)).toEqual(expect.arrayContaining([
      "community_notification_outbox_status_check",
      "community_notification_outbox_reason_check"
    ]));
    expect(outboxConfig.columns.find((column) => column.name === "delivered_at")).toBeDefined();
  });

  it("matches the terminal-cleanup indexes created by the privacy migration", () => {
    expect(getTableConfig(clubChatMessages).indexes.map((item) => item.config.name)).toContain(
      "club_chat_messages_terminal_cleanup_idx"
    );
    expect(getTableConfig(clubMessageAttachments).indexes.map((item) => item.config.name)).toContain(
      "club_message_attachments_terminal_cleanup_idx"
    );
  });
});

describe("reliable community chat migration", () => {
  it("keeps release migrations additive and compatible with the previous web client", () => {
    const releaseMigrations = [migration, reliabilityMigration, uploadManifestMigration, mediaCandidateMigration];

    for (const sql of releaseMigrations) {
      expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN)\b/i);
      expect(sql).not.toMatch(/TRUNCATE\b|DELETE\s+FROM\b|ALTER\s+COLUMN\b|RENAME\s+(?:TABLE|COLUMN)\b/i);
    }
    expect(migration).toContain('ADD COLUMN "client_operation_id" varchar(96)');
    expect(uploadManifestMigration).toContain('CREATE TABLE "community_upload_manifests"');
    expect(mediaCandidateMigration).toContain('CREATE TABLE "community_media_candidates"');
  });

  it("contains the matching scan-state check and search expression", () => {
    expect(migration).toContain('CONSTRAINT "club_message_attachments_scan_status_check"');
    expect(migration).toContain("CHECK (\"scan_status\" IN ('pending','scanning','ready','rejected','failed','deleted'))");
    expect(migration).toContain("to_tsvector('simple', coalesce(\"body\", ''))");
  });

  it("registers migration 63 in the drizzle journal", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0063_reliable_community_chat")).toMatchObject({
      idx: 63,
      tag: "0063_reliable_community_chat"
    });
  });

  it("adds immutable operation fingerprints and retryable cleanup claims in migration 64", () => {
    expect(reliabilityMigration).toContain('ADD COLUMN "create_request_fingerprint" varchar(64)');
    expect(reliabilityMigration).toContain('ADD COLUMN "deleted_cleanup_claim_id" uuid');
    expect(reliabilityMigration).toContain('ADD COLUMN "deleted_cleanup_claimed_at" timestamptz');
    expect(reliabilityMigration).toContain('CREATE INDEX "club_chat_messages_deleted_cleanup_idx"');
    expect(migrationJournal.entries.find((entry) => entry.tag === "0064_community_message_reliability")).toMatchObject({
      idx: 64,
      tag: "0064_community_message_reliability"
    });
  });

  it("adds durable upload manifests in migration 65", () => {
    expect(uploadManifestMigration).toContain('CREATE TABLE "community_upload_manifests"');
    expect(uploadManifestMigration).toContain('"multipart_upload_id" text');
    expect(uploadManifestMigration).toContain('"final_object_key" text');
    expect(uploadManifestMigration).toContain('"attachment_id" uuid');
    expect(migrationJournal.entries.find((entry) => entry.tag === "0065_community_upload_manifests")).toMatchObject({ idx: 65 });
  });

  it("adds durable media candidate tracking in migration 66", () => {
    expect(mediaCandidateMigration).toContain('CREATE TABLE "community_media_candidates"');
    expect(mediaCandidateMigration).toContain('"lease_updated_at" timestamptz NOT NULL');
    expect(mediaCandidateMigration).toContain('"candidate_object_key" text NOT NULL');
    expect(mediaCandidateMigration).toContain('"final_object_key" text NOT NULL');
    expect(mediaCandidateMigration).toContain("'published_cleanup_pending'");
    expect(migrationJournal.entries.find((entry) => entry.tag === "0066_community_media_candidates")).toMatchObject({ idx: 66 });
  });

  it("adds durable privacy fencing, read tuples, and notification outbox in migration 67", () => {
    expect(privacyFencingMigration).toContain('CREATE TABLE "community_object_deletion_jobs"');
    expect(privacyFencingMigration).toContain('CREATE TABLE "community_object_deletion_entries"');
    expect(privacyFencingMigration).toContain('CREATE TABLE "community_message_purge_requests"');
    expect(privacyFencingMigration).toContain('CREATE TABLE "community_notification_outbox"');
    expect(privacyFencingMigration).toContain('ADD COLUMN "last_read_created_at" timestamptz');
    expect(privacyFencingMigration).toContain('ALTER COLUMN "last_read_message_id" SET NOT NULL');
    expect(privacyFencingMigration).toContain("ffffffff-ffff-ffff-ffff-ffffffffffff");
    expect(privacyFencingMigration).not.toMatch(/DELETE FROM "community_topic_reads"/i);
    expect(privacyFencingMigration).toContain("DROP CONSTRAINT %I");
    expect(privacyFencingMigration).toContain("community_enqueue_message_cleanup");
    expect(privacyFencingMigration).toContain("community_sync_topic_read_tuple_trigger");
    expect(privacyFencingMigration).toContain("community_capture_attachment_delete_trigger");
    expect(privacyFencingMigration).toContain("DELETE FROM community_media_candidates WHERE manifest_id = OLD.id");
    expect(privacyFencingMigration).toContain("row_number() OVER");
    expect(privacyFencingMigration).toContain("subscriptions_community_access_version_trigger");
    expect(privacyFencingMigration).toContain("admin_users_community_access_version_trigger");
    expect(migrationJournal.entries.find((entry) => entry.tag === "0067_community_chat_privacy_fencing")).toMatchObject({ idx: 67 });
  });

  it("adds persistent per-target generations without rewriting migration 67", () => {
    expect(convergentDeletionMigration).toContain('CREATE TABLE "community_object_lifecycles"');
    expect(convergentDeletionMigration).toContain('PRIMARY KEY ("object_key", "target")');
    expect(convergentDeletionMigration).toContain('"generation" integer NOT NULL DEFAULT 1');
    expect(convergentDeletionMigration).toContain("CHECK (\"target\" IN ('primary','reserve'))");
    expect(convergentDeletionMigration).toContain("CHECK (\"state\" IN ('publishing','present','deleted'))");
    expect(convergentDeletionMigration).toContain("manifest.\"status\" IN ('aborted','cleanup_pending','rejected')");
    expect(convergentDeletionMigration).toContain("candidate.\"status\" IN ('cleanup_pending','cleaned')");
    expect(convergentDeletionMigration).toContain("candidate.\"status\" IN ('published_cleanup_pending','published')");
    expect(convergentDeletionMigration).toContain("publication.\"state\" = 'quiescing'");
    expect(convergentDeletionMigration).toContain('DELETE FROM "community_object_publications" publication');
    expect(migrationJournal.entries.find((entry) => entry.tag === "0068_community_object_convergence")).toMatchObject({ idx: 68 });
  });

  it("adds a finite hot queue and retains cold tombstones in forward migration 69", () => {
    expect(existsSync(hotQueueMigrationUrl)).toBe(true);
    if (!existsSync(hotQueueMigrationUrl)) return;
    const hotQueueMigration = readFileSync(hotQueueMigrationUrl, "utf8");
    expect(hotQueueMigration).toContain('ADD COLUMN "hot_until" timestamptz');
    expect(hotQueueMigration).toContain('ADD COLUMN "cold_at" timestamptz');
    expect(hotQueueMigration).toContain('"community_object_lifecycles_hot_due_idx"');
    expect(hotQueueMigration).toContain('"community_object_publications_attachment_stale_idx"');
    expect(hotQueueMigration).toContain("WHERE \"state\" = 'deleted' AND \"cold_at\" IS NULL");
    expect(hotQueueMigration).toContain('SET "hot_until" = clock_timestamp()');
    expect(migrationJournal.entries.find((entry) => entry.tag === "0069_community_object_hot_queue")).toMatchObject({ idx: 69 });
  });
});
