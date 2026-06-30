import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { clubSettings } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { getS3ConfigFromEnv, getS3ConfigFromSetting, storageSettingKey, type StoredS3Config } from "./s3Config";
import { normalizeS3ObjectKey, normalizeS3ObjectPrefix } from "./s3Object";

export type UploadObjectInput = {
  key: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType: string;
};

export type S3StorageTarget = "primary" | "reserve";

async function requireS3Config() {
  const setting = await db.query.clubSettings.findFirst({
    where: eq(clubSettings.key, storageSettingKey)
  });
  const config = getS3ConfigFromSetting(setting?.value) ?? getS3ConfigFromEnv(env);

  if (!config) {
    throw new Error("S3 storage is not configured");
  }

  return config;
}

function createS3Client(config: StoredS3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
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

async function putObjectToConfig(config: StoredS3Config, key: string, body: UploadObjectInput["body"], contentType: string) {
  const client = createS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
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

async function buildObjectReadUrl(config: StoredS3Config, key: string) {
  await assertObjectReadable(config, key);

  if (config.publicBaseUrl) {
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
    url: config.publicBaseUrl ? `${config.publicBaseUrl}/${normalizedKey}` : null
  };
}

export async function getObjectReadUrl(key: string, target: S3StorageTarget = "primary") {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);

  if (target === "reserve") {
    return buildObjectReadUrl(resolveS3TargetConfig(config, "reserve"), normalizedKey);
  }

  try {
    return await buildObjectReadUrl(config, normalizedKey);
  } catch (error) {
    if (!config.reserve) {
      throw error;
    }

    logger.warn({ error, key: normalizedKey }, "Primary S3 read failed, trying reserve S3");
    return buildObjectReadUrl({ ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null }, normalizedKey);
  }
}

export async function deleteObject(key: string, target: S3StorageTarget = "primary") {
  const config = await requireS3Config();
  const targetConfig = resolveS3TargetConfig(config, target);
  const client = createS3Client(targetConfig);
  const normalizedKey = normalizeS3ObjectKey(key);

  await client.send(
    new DeleteObjectCommand({
      Bucket: targetConfig.bucket,
      Key: normalizedKey
    })
  );
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
