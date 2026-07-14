import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutBucketCorsCommand,
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
import { buildBrowserUploadCorsRule } from "./s3Cors";

export type UploadObjectInput = {
  key: string;
  body: NonNullable<PutObjectCommandInput["Body"]>;
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

let browserUploadCorsKey = "";
let browserUploadCorsPromise: Promise<void> | null = null;

async function ensureBrowserUploadCors(config: StoredS3Config) {
  const webOrigin = new URL(env.WEB_ORIGIN).origin;
  const configKey = `${config.endpoint}|${config.bucket}|${webOrigin}`;

  if (browserUploadCorsKey !== configKey) {
    browserUploadCorsKey = configKey;
    browserUploadCorsPromise = null;
  }

  if (!browserUploadCorsPromise) {
    const client = createS3Client(config);
    browserUploadCorsPromise = client
      .send(
        new PutBucketCorsCommand({
          Bucket: config.bucket,
          CORSConfiguration: {
            CORSRules: [buildBrowserUploadCorsRule(webOrigin)]
          }
        })
      )
      .then(() => undefined)
      .catch((error) => {
        browserUploadCorsPromise = null;
        throw error;
      });
  }

  await browserUploadCorsPromise;
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

async function headObject(config: StoredS3Config, key: string) {
  const client = createS3Client(config);
  return client.send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

async function buildObjectReadUrl(config: StoredS3Config, key: string, verifyReadable: boolean) {
  if (verifyReadable) {
    await assertObjectReadable(config, key);
  }

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

export async function createObjectUploadUrl({ key, contentType, expiresInSeconds = 600 }: { key: string; contentType: string; expiresInSeconds?: number }) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const client = createS3Client(config);
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      ContentType: contentType
    }),
    { expiresIn: expiresInSeconds }
  );

  return {
    uploadUrl,
    key: normalizedKey,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
  };
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
  await ensureBrowserUploadCors(config);
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

  const parts = await Promise.all(
    Array.from({ length: safePartsCount }, async (_, index) => {
      const partNumber = index + 1;
      const uploadUrl = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: config.bucket,
          Key: normalizedKey,
          UploadId: multipart.UploadId,
          PartNumber: partNumber
        }),
        { expiresIn: expiresInSeconds }
      );

      return { partNumber, uploadUrl };
    })
  );

  return {
    key: normalizedKey,
    uploadId: multipart.UploadId,
    parts,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
  };
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

export async function getObjectReadUrl(key: string, target: S3StorageTarget = "primary", options: { verifyReadable?: boolean } = {}) {
  const config = await requireS3Config();
  const normalizedKey = normalizeS3ObjectKey(key);
  const verifyReadable = options.verifyReadable ?? false;

  if (target === "reserve") {
    return buildObjectReadUrl(resolveS3TargetConfig(config, "reserve"), normalizedKey, verifyReadable);
  }

  try {
    return await buildObjectReadUrl(config, normalizedKey, verifyReadable);
  } catch (error) {
    if (!config.reserve) {
      throw error;
    }

    logger.warn({ error, key: normalizedKey }, "Primary S3 read failed, trying reserve S3");
    return buildObjectReadUrl({ ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null }, normalizedKey, verifyReadable);
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
