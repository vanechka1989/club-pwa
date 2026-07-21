import { getDatabaseBackupFileName } from "./backup";

export const automaticBackupPrefix = "system/database-backups/";

type BackupObject = {
  key: string;
  lastModified: string | null;
};

export function buildAutomaticBackupKey(date = new Date()) {
  return `${automaticBackupPrefix}${getDatabaseBackupFileName(date)}`;
}

export function selectExpiredBackupKeys(
  objects: BackupObject[],
  {
    currentKey,
    now = new Date(),
    retentionDays = 30
  }: { currentKey: string; now?: Date; retentionDays?: number }
) {
  const cutoff = now.getTime() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  return objects
    .filter((object) => object.key.startsWith(automaticBackupPrefix))
    .filter((object) => object.key !== currentKey)
    .filter((object) => object.lastModified && new Date(object.lastModified).getTime() < cutoff)
    .map((object) => object.key);
}
