import { runAutomaticDatabaseBackup } from "./automaticBackup";

const parsedRetentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
const retentionDays = Number.isFinite(parsedRetentionDays) && parsedRetentionDays > 0 ? parsedRetentionDays : 30;

try {
  const result = await runAutomaticDatabaseBackup({ retentionDays });
  console.log(JSON.stringify({ ok: true, ...result }));
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
