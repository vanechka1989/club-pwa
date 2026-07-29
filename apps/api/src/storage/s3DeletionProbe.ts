import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";
import type { StoredS3Config } from "./s3Config";

export type S3DeletionProbeObject = {
  key: string;
  versionId: string;
  kind: "version" | "delete-marker";
};

type S3DeletionProbeDependencies = {
  put: (key: string, body: Uint8Array) => Promise<void>;
  deleteCurrent: (key: string) => Promise<void>;
  list: (key: string) => Promise<S3DeletionProbeObject[]>;
  deleteVersions: (objects: S3DeletionProbeObject[]) => Promise<void>;
};

export function createS3AllVersionDeletionProbe(dependencies: S3DeletionProbeDependencies) {
  return async function probeAllVersionDeletion(key: string) {
    let created = false;
    try {
      created = true;
      await dependencies.put(key, new TextEncoder().encode("community-deletion-probe-v1"));
      await dependencies.put(key, new TextEncoder().encode("community-deletion-probe-v2"));
      await dependencies.deleteCurrent(key);

      const objects = await dependencies.list(key);
      const versions = objects.filter((object) => object.kind === "version");
      const deleteMarkers = objects.filter((object) => object.kind === "delete-marker");
      if (versions.length < 2) throw new Error("S3 deletion probe could not enumerate both object versions");
      if (deleteMarkers.length < 1) throw new Error("S3 deletion probe could not create or enumerate a delete marker");
      await dependencies.deleteVersions(objects);
      if ((await dependencies.list(key)).length) {
        throw new Error("S3 deletion probe left object versions or delete markers behind");
      }
      created = false;
      return { versions: versions.length, deleteMarkers: deleteMarkers.length };
    } finally {
      if (created) {
        const remaining = await dependencies.list(key).catch(() => []);
        if (remaining.length) await dependencies.deleteVersions(remaining).catch(() => undefined);
      }
    }
  };
}

async function listExactObjectVersions(client: S3Client, bucket: string, key: string) {
  const objects: S3DeletionProbeObject[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const page = await client.send(new ListObjectVersionsCommand({
      Bucket: bucket,
      Prefix: key,
      ...(keyMarker ? { KeyMarker: keyMarker } : {}),
      ...(versionIdMarker ? { VersionIdMarker: versionIdMarker } : {})
    }));
    const append = (
      entries: Array<{ Key?: string | undefined; VersionId?: string | undefined }> | undefined,
      kind: S3DeletionProbeObject["kind"]
    ) => {
      for (const entry of entries ?? []) {
        if (entry.Key === key && entry.VersionId) objects.push({ key: entry.Key, versionId: entry.VersionId, kind });
      }
    };
    append(page.Versions, "version");
    append(page.DeleteMarkers, "delete-marker");
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);
  return objects;
}

export async function probeS3AllVersionDeletion(
  target: "primary" | "reserve",
  config: StoredS3Config
) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
    requestHandler: new NodeHttpHandler({ connectionTimeout: 5_000, socketTimeout: 120_000 })
  });
  const key = `community/.deletion-probes/${target}/${randomUUID()}`;
  const probe = createS3AllVersionDeletionProbe({
    put: async (objectKey, body) => {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, Body: body }));
    },
    deleteCurrent: async (objectKey) => {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    },
    list: (objectKey) => listExactObjectVersions(client, config.bucket, objectKey),
    deleteVersions: async (objects) => {
      const response = await client.send(new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Quiet: false, Objects: objects.map((object) => ({ Key: object.key, VersionId: object.versionId })) }
      }));
      if (response.Errors?.length) {
        throw new AggregateError(
          response.Errors.map((error) => new Error(`${error.Code ?? "S3DeleteError"}: ${error.Message ?? "unknown"}`)),
          `${target} S3 deletion probe could not delete every VersionId`
        );
      }
    }
  });
  try {
    return await probe(key);
  } finally {
    client.destroy();
  }
}
