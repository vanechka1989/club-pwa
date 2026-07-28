import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";

const migrationPath = resolve(__dirname, "../../drizzle/0063_reliable_community_chat.sql");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const schema = readFileSync(resolve(__dirname, "schema.ts"), "utf8");

describe("reliable community chat persistence", () => {
  it("stores per-user read positions and notification settings", () => {
    expect(migration).toContain('CREATE TABLE "community_topic_reads"');
    expect(migration).toContain('PRIMARY KEY ("user_id", "topic_id")');
    expect(migration).toContain('CREATE TABLE "community_topic_notification_settings"');
    expect(migration).toContain("CHECK (\"mode\" IN ('all','mentions','off'))");
    expect(schema).toContain("export const communityTopicReads = pgTable(");
    expect(schema).toContain("export const communityTopicNotificationSettings = pgTable(");
  });

  it("stores idempotent edits, user deletions, mentions, and search indexes", () => {
    expect(migration).toContain('CREATE TABLE "club_message_mentions"');
    expect(migration).toContain('ADD COLUMN "client_operation_id" varchar(96)');
    expect(migration).toContain('ADD COLUMN "edited_at" timestamptz');
    expect(migration).toContain('ADD COLUMN "deleted_by_user_at" timestamptz');
    expect(migration).toContain('ADD COLUMN "deleted_content_expires_at" timestamptz');
    expect(migration).toContain('CREATE UNIQUE INDEX "club_chat_messages_user_operation_idx"');
    expect(migration).toContain('WHERE "client_operation_id" IS NOT NULL');
    expect(migration).toContain('CREATE INDEX "club_chat_messages_search_idx"');
    expect(migration).toContain("to_tsvector('simple', coalesce(\"body\", ''))");
    expect(migration).toContain('CREATE INDEX "club_chat_messages_deleted_expiry_idx"');
    expect(schema).toContain("export const clubMessageMentions = pgTable(");
    expect(schema).toContain('clientOperationId: varchar("client_operation_id", { length: 96 })');
    expect(schema).toContain('deletedContentExpiresAt: timestamp("deleted_content_expires_at"');
  });

  it("stores attachment scan state and prevents object reuse", () => {
    expect(migration).toContain('ADD COLUMN "file_name" varchar(255)');
    expect(migration).toContain('ADD COLUMN "scan_status" varchar(16) NOT NULL DEFAULT \'ready\'');
    expect(migration).toContain('ADD COLUMN "scanned_at" timestamptz');
    expect(migration).toContain('ADD COLUMN "scan_error" varchar(160)');
    expect(migration).toContain('CREATE UNIQUE INDEX "club_message_attachments_object_key_idx"');
    expect(schema).toContain('scanStatus: varchar("scan_status", { length: 16 }).notNull().default("ready")');
  });

  it("registers migration 63 in the drizzle journal", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0063_reliable_community_chat")).toMatchObject({
      idx: 63,
      tag: "0063_reliable_community_chat"
    });
  });
});
