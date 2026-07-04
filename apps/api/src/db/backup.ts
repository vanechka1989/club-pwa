export const databaseRestoreConfirmationText = "ВОССТАНОВИТЬ";
export const databaseBackupDownloadTokenTtlMs = 5 * 60 * 1000;

const databaseBackupDownloadTokens = new Map<string, Date>();

export function buildPgDumpArgs(databaseUrl: string) {
  return ["--format=custom", "--no-owner", "--no-privileges", "--dbname", databaseUrl];
}

export function buildPgRestoreArgs(databaseUrl: string, filePath: string) {
  return ["--clean", "--if-exists", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", databaseUrl, filePath];
}

export function validateDatabaseRestoreConfirmation(value: string) {
  return value.trim() === databaseRestoreConfirmationText;
}

export function getDatabaseBackupFileName(date = new Date()) {
  const timestamp = date.toISOString().replace(/\.\d{3}Z$/, "").replace("T", "-").replace(/:/g, "-");
  return `club-database-${timestamp}.dump`;
}

export function createDatabaseBackupDownloadToken(token: string, now = new Date()) {
  const expiresAt = new Date(now.getTime() + databaseBackupDownloadTokenTtlMs);
  databaseBackupDownloadTokens.set(token, expiresAt);
  return { token, expiresAt };
}

export function consumeDatabaseBackupDownloadToken(token: string, now = new Date()) {
  const expiresAt = databaseBackupDownloadTokens.get(token);
  databaseBackupDownloadTokens.delete(token);

  return Boolean(expiresAt && expiresAt.getTime() >= now.getTime());
}
