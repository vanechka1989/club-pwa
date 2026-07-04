import { describe, expect, it } from "vitest";
import {
  buildPgDumpArgs,
  buildPgRestoreArgs,
  consumeDatabaseBackupDownloadToken,
  createDatabaseBackupDownloadToken,
  databaseRestoreConfirmationText,
  getDatabaseBackupFileName,
  validateDatabaseRestoreConfirmation
} from "./backup";

describe("database backup helpers", () => {
  const databaseUrl = "postgres://club:club@localhost:5432/club";

  it("builds a portable pg_dump command for manual backup", () => {
    expect(buildPgDumpArgs(databaseUrl)).toEqual([
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      databaseUrl
    ]);
  });

  it("builds a destructive pg_restore command only from an uploaded file", () => {
    expect(buildPgRestoreArgs(databaseUrl, "/tmp/club-backup.dump")).toEqual([
      "--clean",
      "--if-exists",
      "--single-transaction",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      databaseUrl,
      "/tmp/club-backup.dump"
    ]);
  });

  it("requires an explicit Russian confirmation before restoring", () => {
    expect(validateDatabaseRestoreConfirmation(databaseRestoreConfirmationText)).toBe(true);
    expect(validateDatabaseRestoreConfirmation("восстановить")).toBe(false);
    expect(validateDatabaseRestoreConfirmation("")).toBe(false);
  });

  it("uses a clear dated filename for downloaded backups", () => {
    const fileName = getDatabaseBackupFileName(new Date("2026-07-04T01:02:03.000Z"));

    expect(fileName).toBe("club-database-2026-07-04-01-02-03.dump");
  });

  it("creates one-time browser download tokens for Telegram webviews", () => {
    const token = "download-token";
    const created = createDatabaseBackupDownloadToken(token, new Date("2026-07-04T01:00:00.000Z"));

    expect(created.expiresAt).toEqual(new Date("2026-07-04T01:05:00.000Z"));
    expect(consumeDatabaseBackupDownloadToken(token, new Date("2026-07-04T01:01:00.000Z"))).toBe(true);
    expect(consumeDatabaseBackupDownloadToken(token, new Date("2026-07-04T01:01:01.000Z"))).toBe(false);
  });

  it("rejects expired database backup download tokens", () => {
    const token = "expired-download-token";
    createDatabaseBackupDownloadToken(token, new Date("2026-07-04T01:00:00.000Z"));

    expect(consumeDatabaseBackupDownloadToken(token, new Date("2026-07-04T01:05:01.000Z"))).toBe(false);
  });
});
