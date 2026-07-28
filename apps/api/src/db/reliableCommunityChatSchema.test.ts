import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";
import {
  clubChatMessages,
  clubMessageAttachments,
  clubMessageMentions,
  communityUploadManifests,
  communityTopicNotificationSettings,
  communityTopicReads
} from "./schema";

const migration = readFileSync(new URL("../../drizzle/0063_reliable_community_chat.sql", import.meta.url), "utf8");
const reliabilityMigration = readFileSync(new URL("../../drizzle/0064_community_message_reliability.sql", import.meta.url), "utf8");
const uploadManifestMigration = readFileSync(new URL("../../drizzle/0065_community_upload_manifests.sql", import.meta.url), "utf8");

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
  it("models per-user read positions with a composite key and deleting foreign keys", () => {
    const config = getTableConfig(communityTopicReads);

    expect(config.name).toBe("community_topic_reads");
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(["user_id", "topic_id"]);
    expect(foreignKeys(communityTopicReads)).toEqual(
      expect.arrayContaining([
        { columns: ["user_id"], foreignTable: "users", foreignColumns: ["id"], onDelete: "cascade" },
        { columns: ["topic_id"], foreignTable: "club_chat_topics", foreignColumns: ["id"], onDelete: "cascade" },
        {
          columns: ["last_read_message_id"],
          foreignTable: "club_chat_messages",
          foreignColumns: ["id"],
          onDelete: "set null"
        }
      ])
    );
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
});

describe("reliable community chat migration", () => {
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
});
