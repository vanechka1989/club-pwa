import { basename } from "node:path";
import { deleteObject, getObjectMetadata, listObjects, uploadObject } from "./s3";

const sourcePath = process.argv[2] ?? "";
const backupKind = process.argv[3] ?? "";
const prefixes: Record<string, string> = {
  "uptime-kuma": "system/uptime-kuma-backups/"
};

if (!sourcePath.startsWith("/operational-backup/") || !prefixes[backupKind]) {
  throw new Error("Unsupported operational backup input");
}

const file = Bun.file(sourcePath);
if (!(await file.exists()) || file.size <= 0) {
  throw new Error("Operational backup file is empty or missing");
}

const prefix = prefixes[backupKind]!;
const key = `${prefix}${basename(sourcePath)}`;
await uploadObject({ key, body: new Uint8Array(await file.arrayBuffer()), contentType: "application/gzip" });
const metadata = await getObjectMetadata(key);
if (!metadata.sizeBytes || metadata.sizeBytes !== file.size) {
  throw new Error("Uploaded operational backup size verification failed");
}

const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
const objects = await listObjects({ prefix, limit: 100 });
for (const object of objects.objects) {
  if (object.key !== key && object.lastModified && new Date(object.lastModified).getTime() < cutoff) {
    await deleteObject(object.key);
  }
}

console.log(JSON.stringify({ ok: true, key, sizeBytes: metadata.sizeBytes }));
