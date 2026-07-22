import { downloadObjectBytes, listObjects } from "../storage/s3";
import { automaticBackupPrefix, selectLatestBackupObject } from "./automaticBackupPolicy";

const outputPath = process.argv[2] ?? "";

try {
  if (!outputPath.startsWith("/backup-export/") || !outputPath.endsWith(".dump")) {
    throw new Error("Backup export path must be a .dump file inside /backup-export");
  }
  const page = await listObjects({ prefix: automaticBackupPrefix, limit: 100 });
  const latest = selectLatestBackupObject(page.objects);
  if (!latest) {
    throw new Error("No completed automatic database backup is available");
  }
  const bytes = await downloadObjectBytes(latest.key);
  if (!bytes.byteLength) {
    throw new Error("Downloaded database backup is empty");
  }
  await Bun.write(outputPath, bytes);
  console.log(JSON.stringify({ ok: true, key: latest.key, sizeBytes: bytes.byteLength }));
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
