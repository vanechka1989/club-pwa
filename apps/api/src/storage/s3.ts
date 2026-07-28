import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  S3Client,
  type PutObjectCommandInput
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { clubSettings } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { getS3ConfigFromEnv, getS3ConfigFromSetting, storageSettingKey, type StoredS3Config } from "./s3Config";
import { normalizeS3ObjectKey, normalizeS3ObjectPrefix } from "./s3Object";
import { createRuntimeResourceCache } from "./runtimeResourceCache";

export type UploadObjectInput = {
  key: string;
  body: NonNullable<PutObjectCommandInput["Body"]>;
  contentType: string;
};

export type S3StorageTarget = "primary" | "reserve";

type DeleteObjectCopiesDependencies = {
  loadConfig: () => Promise<StoredS3Config>;
  deleteFromConfig: (config: StoredS3Config, key: string) => Promise<void>;
};

async function loadS3Config() {
  const setting = await db.query.clubSettings.findFirst({
    where: eq(clubSettings.key, storageSettingKey)
  });
  const config = getS3ConfigFromSetting(setting?.value) ?? getS3ConfigFromEnv(env);

  if (!config) {
    throw new Error("S3 storage is not configured");
  }

  return config;
}

const s3ConfigCache = createRuntimeResourceCache({
  load: loadS3Config,
  ttlMs: 60_000
});

const s3Clients = new Map<string, S3Client>();

function s3ClientCacheKey(config: StoredS3Config) {
  return JSON.stringify([
    config.endpoint,
    config.region,
    config.bucket,
    config.accessKeyId,
    config.secretAccessKey
  ]);
}

async function requireS3Config() {
  return s3ConfigCache.get();
}

export function invalidateS3RuntimeCache() {
  s3ConfigCache.invalidate();
  for (const client of s3Clients.values()) {
    client.destroy();
  }
  s3Clients.clear();
}

function createS3Client(config: StoredS3Config) {
  const cacheKey = s3ClientCacheKey(config);
  const cachedClient = s3Clients.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  s3Clients.set(cacheKey, client);
  return client;
}

function resolveS3TargetConfig(config: StoredS3Config, target: S3StorageTarget) {
  if (target === "primary") {
    return config;
  }

  if (!config.reserve) {
    throw new Error("Reserve S3 storage is not configured");
  }

  return { ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null };
}

async function putObjectToConfig(
  config: StoredS3Config,
  key: string,
  body: UploadObjectInput["body"],
  contentType: string,
  contentLength?: number
) {
  const client = createS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength
    })
  );
}

async function assertObjectReadable(config: StoredS3Config, key: string) {
  const client = createS3Client(config);
  await client.send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

async function headObject(config: StoredS3Config, key: string) {
  const client = createS3Client(config);
  return client.send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

async function buildObjectReadUrl(config: StoredS3Config, key: string, verifyReadable: boolean, allowPublic: boolean) {
  if (verifyReadable) {
    await assertObjectReadable(config, key);
  }

  if (allowPublic && config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${key}`;
  }

  const client = createS3Client(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    }),
    { expiresIn: config.signedUrlTtlSeconds }
  );
}

export async function uploadObject({ key, body, contentType }: UploadObjectInput) {
  const config = await requireS3Config();
  const normalizedKey = key.replace(/^\/+/, "");

  await putObjectToConfig(config, normalizedKey, body, contentType);

  if (config.reserve) {
    void putObjectToConfig({ ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null }, normalizedKey, body, contentType).catch((error) => {
      logger.warn({ error, key: normalizedKey }, "Failed to mirror object to reserve S3");
    });
  }

  return {
    key: normalizedKey,
    url: null
  };
}

export async function uploadObjectStream({
  key,
  body,
  contentType,
  sizeBytes
}: UploadObjectInput & { sizeBytes: number }) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  await putObjectToConfig(config, normalizedKey, body, contentType, sizeBytes);
  return { key: normalizedKey, url: null };
}

export async function createObjectUploadUrl({
  key,
  contentType,
  sizeBytes,
  expiresInSeconds = 600
}: {
  key: string;
  contentType: string;
  sizeBytes?: number;
  expiresInSeconds?: number;
}) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const client = createS3Client(config);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      ContentType: contentType,
      ContentLength: sizeBytes
    }),
    { expiresIn: expiresInSeconds }
  );

  return {
    uploadUrl,
    key: normalizedKey,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
  };
}

export async function createMultipartPartUploadUrl({
  key,
  uploadId,
  partNumber,
  expiresInSeconds = 600
}: {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
}) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 1000) {
    throw new Error("Invalid multipart part number");
  }
  const uploadUrl = await getSignedUrl(
    createS3Client(config),
    new UploadPartCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      UploadId: uploadId,
      PartNumber: partNumber
    }),
    { expiresIn: expiresInSeconds }
  );
  return uploadUrl;
}

export async function createMultipartUpload({
  key,
  contentType,
  partsCount,
  expiresInSeconds = 1800
}: {
  key: string;
  contentType: string;
  partsCount: number;
  expiresInSeconds?: number;
}) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const safePartsCount = Math.min(Math.max(partsCount, 1), 1000);
  const client = createS3Client(config);
  const multipart = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      ContentType: contentType
    })
  );

  if (!multipart.UploadId) {
    throw new Error("S3 multipart upload id is missing");
  }

  const parts = Array.from({ length: safePartsCount }, (_, index) => ({ partNumber: index + 1 }));

  return {
    key: normalizedKey,
    uploadId: multipart.UploadId,
    parts,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
  };
}

export async function uploadMultipartPart({
  key,
  uploadId,
  partNumber,
  body
}: {
  key: string;
  uploadId: string;
  partNumber: number;
  body: Uint8Array;
}) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const client = createS3Client(config);
  const response = await client.send(
    new UploadPartCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body
    })
  );

  if (!response.ETag) {
    throw new Error("S3 multipart part ETag is missing");
  }

  return { etag: response.ETag };
}

export async function completeMultipartUpload({
  key,
  uploadId,
  parts
}: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const client = createS3Client(config);

  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((left, right) => left.partNumber - right.partNumber)
          .map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag
          }))
      }
    })
  );

  return { key: normalizedKey };
}

export async function abortMultipartUpload({ key, uploadId }: { key: string; uploadId: string }) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const client = createS3Client(config);

  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      UploadId: uploadId
    })
  );
}

export async function getObjectMetadata(key: string, target: S3StorageTarget = "primary") {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const response = await headObject(resolveS3TargetConfig(config, target), normalizedKey);

  return {
    key: normalizedKey,
    contentType: response.ContentType ?? null,
    sizeBytes: response.ContentLength ?? null
  };
}

export async function downloadObjectBytes(key: string, target: S3StorageTarget = "primary") {
  const config = await requireS3Config();
  const targetConfig = resolveS3TargetConfig(config, target);
  const normalizedKey = normalizeS3ObjectKey(key);
  const response = await createS3Client(targetConfig).send(
    new GetObjectCommand({ Bucket: targetConfig.bucket, Key: normalizedKey })
  );
  if (!response.Body) {
    throw new Error("S3 object body is empty");
  }
  return response.Body.transformToByteArray();
}

export async function downloadObjectPrefix(key: string, maxBytes: number, target: S3StorageTarget = "primary") {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024) {
    throw new Error("Invalid S3 prefix byte limit");
  }
  const config = await requireS3Config();
  const targetConfig = resolveS3TargetConfig(config, target);
  const normalizedKey = normalizeS3ObjectKey(key);
  const response = await createS3Client(targetConfig).send(
    new GetObjectCommand({
      Bucket: targetConfig.bucket,
      Key: normalizedKey,
      Range: `bytes=0-${maxBytes - 1}`
    })
  );
  if (!response.Body) throw new Error("S3 object body is empty");
  const bytes = await response.Body.transformToByteArray();
  return bytes.byteLength > maxBytes ? bytes.slice(0, maxBytes) : bytes;
}

export async function* streamObjectBytes(key: string, target: S3StorageTarget = "primary"): AsyncGenerator<Uint8Array> {
  const config = await requireS3Config();
  const targetConfig = resolveS3TargetConfig(config, target);
  const normalizedKey = normalizeS3ObjectKey(key);
  const response = await createS3Client(targetConfig).send(
    new GetObjectCommand({ Bucket: targetConfig.bucket, Key: normalizedKey })
  );
  if (!response.Body) throw new Error("S3 object body is empty");
  const body = response.Body as unknown as AsyncIterable<Uint8Array>;
  if (!body[Symbol.asyncIterator]) throw new Error("S3 object body is not streamable");
  for await (const chunk of body) {
    yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
  }
}

export async function mirrorObjectToReserve(key: string, contentType: string) {
  const config = await requireS3Config();
  if (!config.reserve) {
    return;
  }

  const normalizedKey = normalizeS3ObjectKey(key);
  const sourceClient = createS3Client(config);
  const response = await sourceClient.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey
    })
  );

  if (!response.Body) {
    throw new Error("S3 object body is empty");
  }

  await putObjectToConfig(
    { ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null },
    normalizedKey,
    response.Body,
    contentType
  );
}

export async function getObjectReadUrl(
  key: string,
  target: S3StorageTarget = "primary",
  options: { verifyReadable?: boolean; allowPublic?: boolean } = {}
) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const verifyReadable = options.verifyReadable ?? false;
  const allowPublic = options.allowPublic ?? false;

  if (target === "reserve") {
    return buildObjectReadUrl(resolveS3TargetConfig(config, "reserve"), normalizedKey, verifyReadable, allowPublic);
  }

  try {
    return await buildObjectReadUrl(config, normalizedKey, verifyReadable, allowPublic);
  } catch (error) {
    if (!config.reserve) {
      throw error;
    }

    logger.warn({ error, key: normalizedKey }, "Primary S3 read failed, trying reserve S3");
    return buildObjectReadUrl(
      { ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null },
      normalizedKey,
      verifyReadable,
      allowPublic
    );
  }
}

async function deleteObjectFromConfig(config: StoredS3Config, key: string) {
  const client = createS3Client(config);
  const normalizedKey = normalizeS3ObjectKey(key);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey
    })
  );
}

export function createDeleteObjectCopies(dependencies: DeleteObjectCopiesDependencies) {
  return async function deleteObjectCopiesWithDependencies(key: string) {
    const config = await dependencies.loadConfig();
    const normalizedKey = normalizeS3ObjectKey(key);
    const targets = [
      config,
      ...(config.reserve
        ? [{ ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null }]
        : [])
    ];
    const results = await Promise.allSettled(
      targets.map((targetConfig) => dependencies.deleteFromConfig(targetConfig, normalizedKey))
    );
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length === 1) throw failures[0]!.reason;
    if (failures.length > 1) {
      throw new AggregateError(failures.map((failure) => failure.reason), "Unable to delete every S3 object copy");
    }
  };
}

export const deleteObjectCopies = createDeleteObjectCopies({
  loadConfig: requireS3Config,
  deleteFromConfig: deleteObjectFromConfig
});

export async function deleteObject(key: string, target: S3StorageTarget = "primary") {
  const config = await requireS3Config();
  await deleteObjectFromConfig(resolveS3TargetConfig(config, target), key);
}

export async function listObjects({
  prefix,
  cursor,
  limit = 50,
  target = "primary"
}: {
  prefix?: string | null;
  cursor?: string | null;
  limit?: number;
  target?: S3StorageTarget;
}) {
  const config = await requireS3Config();
  const targetConfig = resolveS3TargetConfig(config, target);
  const client = createS3Client(targetConfig);
  const normalizedPrefix = normalizeS3ObjectPrefix(prefix);

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: targetConfig.bucket,
      Prefix: normalizedPrefix,
      ContinuationToken: cursor || undefined,
      MaxKeys: Math.min(Math.max(limit, 1), 100)
    })
  );

  return {
    prefix: normalizedPrefix,
    nextCursor: response.NextContinuationToken ?? null,
    objects: (response.Contents ?? [])
      .filter((item) => item.Key && !item.Key.endsWith("/"))
      .map((item) => ({
        key: item.Key!,
        sizeBytes: item.Size ?? 0,
        lastModified: item.LastModified?.toISOString() ?? null,
        etag: item.ETag?.replace(/^"|"$/g, "") ?? null
      }))
  };
}

export async function testS3Connection(config: StoredS3Config) {
  const client = createS3Client(config);
  await client.send(
    new HeadBucketCommand({
      Bucket: config.bucket
    })
  );
}
