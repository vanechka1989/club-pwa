import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(__dirname, "../../drizzle/0038_community_media_polls.sql");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("community media and poll schema", () => {
  it("adds message kinds, expiring attachments, polls, options, and unique votes", () => {
    expect(migration).toContain('ADD COLUMN "kind" varchar(16) DEFAULT \'text\' NOT NULL');
    expect(migration).toContain('CREATE TABLE "club_message_attachments"');
    expect(migration).toContain('"expires_at" timestamp with time zone');
    expect(migration).toContain('CREATE INDEX "club_message_attachments_expiry_idx"');
    expect(migration).toContain('CREATE TABLE "club_polls"');
    expect(migration).toContain('CREATE TABLE "club_poll_options"');
    expect(migration).toContain('CREATE TABLE "club_poll_votes"');
    expect(migration).toContain('CREATE UNIQUE INDEX "club_poll_votes_poll_user_option_idx"');
  });
});
