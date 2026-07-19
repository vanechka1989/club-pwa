import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";

describe("persistent server errors", () => {
  it("stores errors with useful lookup indexes", () => {
    const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../../drizzle/0047_server_error_logs.sql", import.meta.url), "utf8");

    expect(schema).toContain('"server_error_logs"');
    expect(migration).toContain('CREATE TABLE "server_error_logs"');
    expect(migration).toContain('server_error_logs_created_idx');
    expect(migration).toContain('server_error_logs_status_created_idx');
  });

  it("registers the migration in the drizzle journal", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0047_server_error_logs")).toMatchObject({
      idx: 47,
      tag: "0047_server_error_logs",
    });
  });
});
