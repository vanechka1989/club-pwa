import { env } from "../env";
import { deleteObject, getObjectMetadata, listObjects, uploadObject } from "../storage/s3";
import { buildPgDumpArgs } from "./backup";
import { automaticBackupPrefix, buildAutomaticBackupKey, selectExpiredBackupKeys } from "./automaticBackupPolicy";

async function createDatabaseDump() {
  const processResult = Bun.spawn(["pg_dump", ...buildPgDumpArgs(env.DATABASE_URL)], {
    stdout: "pipe",
    stderr: "pipe"
  });
  const [exitCode, output, detail] = await Promise.all([
    processResult.exited,
    new Response(processResult.stdout).arrayBuffer(),
    new Response(processResult.stderr).text()
  ]);

  if (exitCode !== 0 || output.byteLength === 0) {
    throw new Error(`pg_dump failed${detail.trim() ? `: ${detail.trim()}` : ""}`);
  }
  return output;
}

async function listAllBackups() {
  const objects: Array<{ key: string; lastModified: string | null }> = [];
  let cursor: string | null = null;
  do {
    const page = await listObjects({ prefix: automaticBackupPrefix, cursor, limit: 100 });
    objects.push(...page.objects.map(({ key, lastModified }) => ({ key, lastModified })));
    cursor = page.nextCursor;
  } while (cursor);
  return objects;
}

export async function runAutomaticDatabaseBackup({
  now = new Date(),
  retentionDays = 30
}: { now?: Date; retentionDays?: number } = {}) {
  const key = buildAutomaticBackupKey(now);
  const dump = await createDatabaseDump();
  await uploadObject({ key, body: new Uint8Array(dump), contentType: "application/octet-stream" });

  const metadata = await getObjectMetadata(key);
  if (!metadata.sizeBytes || metadata.sizeBytes !== dump.byteLength) {
    throw new Error("Uploaded database backup verification failed");
  }

  const expiredKeys = selectExpiredBackupKeys(await listAllBackups(), { currentKey: key, now, retentionDays });
  await Promise.all(expiredKeys.map((expiredKey) => deleteObject(expiredKey)));

  return { key, sizeBytes: dump.byteLength, deletedKeys: expiredKeys };
}
