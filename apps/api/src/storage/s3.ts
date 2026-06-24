import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

export type UploadObjectInput = {
  key: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType: string;
};

function requireS3Config() {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  ) {
    throw new Error("S3 storage is not configured");
  }

  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null
  };
}

function createS3Client() {
  const config = requireS3Config();

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
  const config = requireS3Config();
  const client = createS3Client();
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
  const config = requireS3Config();
  const client = createS3Client();
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
    { expiresIn: env.S3_SIGNED_URL_TTL_SECONDS }
  );
}

export async function deleteObject(key: string) {
  const config = requireS3Config();
  const client = createS3Client();
  const normalizedKey = key.replace(/^\/+/, "");

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: normalizedKey
    })
  );
}
