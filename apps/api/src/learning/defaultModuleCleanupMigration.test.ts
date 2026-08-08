import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";

const migrationUrl = new URL("../../drizzle/0071_remove_default_learning_modules.sql", import.meta.url);

describe("default learning module cleanup migration", () => {
  it("deletes only the two historical seed modules", () => {
    const sql = readFileSync(migrationUrl, "utf8");

    expect(sql).toContain('DELETE FROM "content_categories"');
    expect(sql).toContain('"slug" IN (\'module-1-seed\', \'module-2-seed\')');
    expect(sql).not.toContain('"title"');
    expect(sql).not.toContain('"description"');
  });

  it("registers the cleanup as migration 71", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0071_remove_default_learning_modules")).toMatchObject({
      idx: 71,
      version: "7"
    });
  });
});
