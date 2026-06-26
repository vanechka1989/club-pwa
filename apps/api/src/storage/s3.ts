import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { clubSettings } from "../db/schema";
import { env } from "../env";
import { getS3ConfigFromEnv, getS3ConfigFromSetting, storageSettingKey, type StoredS3Config } from "./s3Config";

export type UploadObjectInput = {
  key: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType: string;
};

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

export async function uploadObject({ key, body, contentType }: UploadObjectInput) {
  const config = await requireS3Config();
  const client = createS3Client(config);
  const normalizedKey = key.replace(/^\/+/, "");

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey,
      Body: body,
      ContentType: contentType
    })
  );

  return {
    key: normalizedKey,
    url: config.publicBaseUrl ? `${config.publicBaseUrl}/${normalizedKey}` : null
  };
}

export async function getObjectReadUrl(key: string) {
  const config = await requireS3Config();
  const client = createS3Client(config);
  const normalizedKey = key.replace(/^\/+/, "");

  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${normalizedKey}`;
  }

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey
    }),
    { expiresIn: config.signedUrlTtlSeconds }
  );
}

export async function deleteObject(key: string) {
  const config = await requireS3Config();
  const client = createS3Client(config);
  const normalizedKey = key.replace(/^\/+/, "");

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey
    })
  );
}

export async function testS3Connection(config: StoredS3Config) {
  const client = createS3Client(config);
  await client.send(
    new HeadBucketCommand({
      Bucket: config.bucket
    })
  );
}
