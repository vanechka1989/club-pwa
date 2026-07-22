import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAutomaticBackupKey, selectExpiredBackupKeys, selectLatestBackupObject } from "./automaticBackupPolicy";

const backupRunner = readFileSync(resolve(__dirname, "./runAutomaticBackup.ts"), "utf-8");

describe("automatic database backups", () => {
  it("stores database dumps under an isolated S3 prefix", () => {
    expect(buildAutomaticBackupKey(new Date("2026-07-22T01:02:03.000Z"))).toBe(
      "system/database-backups/club-database-2026-07-22-01-02-03.dump"
    );
  });

  it("deletes only old completed backup objects", () => {
    const objects = [
      { key: "system/database-backups/old.dump", lastModified: "2026-06-01T00:00:00.000Z" },
      { key: "system/database-backups/current.dump", lastModified: "2026-06-01T00:00:00.000Z" },
      { key: "system/database-backups/recent.dump", lastModified: "2026-07-20T00:00:00.000Z" },
      { key: "learning/unrelated.dump", lastModified: "2026-01-01T00:00:00.000Z" }
    ];

    expect(
      selectExpiredBackupKeys(objects, {
        currentKey: "system/database-backups/current.dump",
        now: new Date("2026-07-22T00:00:00.000Z"),
        retentionDays: 30
      })
    ).toEqual(["system/database-backups/old.dump"]);
  });

  it("exits after a successful one-shot backup", () => {
    expect(backupRunner).toContain("process.exit(0)");
  });

  it("selects the newest completed backup for restore verification", () => {
    expect(
      selectLatestBackupObject([
        { key: "system/database-backups/old.dump", lastModified: "2026-07-20T00:00:00.000Z", sizeBytes: 10 },
        { key: "learning/unrelated.dump", lastModified: "2026-07-23T00:00:00.000Z", sizeBytes: 10 },
        { key: "system/database-backups/empty.dump", lastModified: "2026-07-24T00:00:00.000Z", sizeBytes: 0 },
        { key: "system/database-backups/new.dump", lastModified: "2026-07-22T00:00:00.000Z", sizeBytes: 20 }
      ])
    ).toEqual({
      key: "system/database-backups/new.dump",
      lastModified: "2026-07-22T00:00:00.000Z",
      sizeBytes: 20
    });
  });
});
