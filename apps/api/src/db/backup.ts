export const databaseRestoreConfirmationText = "ВОССТАНОВИТЬ";

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
