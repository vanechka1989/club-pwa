import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(__dirname, "../../drizzle/0062_support_attachment_object_key_unique.sql");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("support attachment object consumption", () => {
  it("makes each S3 object consumable by only one attachment", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "support_ticket_attachments_object_key_idx"');
    expect(migration).toContain('ON "support_ticket_attachments" USING btree ("object_key")');
  });
});
