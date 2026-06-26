import { z } from "zod";
import type { S3StorageSettings, S3StorageSource } from "@club/shared";

export const storageSettingKey = "s3_storage_config";

export type StoredS3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
  signedUrlTtlSeconds: number;
};

export type S3EnvInput = {
  S3_ENDPOINT?: string | null | undefined;
  S3_REGION?: string | null | undefined;
  S3_BUCKET?: string | null | undefined;
  S3_ACCESS_KEY_ID?: string | null | undefined;
  S3_SECRET_ACCESS_KEY?: string | null | undefined;
  S3_PUBLIC_BASE_URL?: string | null | undefined;
  S3_SIGNED_URL_TTL_SECONDS?: number | null | undefined;
};

const storedS3ConfigSchema = z.object({
  endpoint: z.string().trim().url(),
  region: z.string().trim().min(1),
  bucket: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
  publicBaseUrl: z.string().trim().url().nullable().optional(),
  signedUrlTtlSeconds: z.coerce.number().int().positive().max(86_400)
});

export function normalizeS3PublicBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

export function normalizeStoredS3Config(input: unknown): StoredS3Config | null {
  const parsed = storedS3ConfigSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  return {
    ...parsed.data,
    publicBaseUrl: normalizeS3PublicBaseUrl(parsed.data.publicBaseUrl)
  };
}

export function getS3ConfigFromSetting(value: string | null | undefined): StoredS3Config | null {
  if (!value) {
    return null;
  }

  try {
    return normalizeStoredS3Config(JSON.parse(value));
  } catch {
    return null;
  }
}

export function getS3ConfigFromEnv(input: S3EnvInput): StoredS3Config | null {
  if (!input.S3_ENDPOINT || !input.S3_BUCKET || !input.S3_ACCESS_KEY_ID || !input.S3_SECRET_ACCESS_KEY) {
    return null;
  }

  return {
    endpoint: input.S3_ENDPOINT,
    region: input.S3_REGION || "us-east-1",
    bucket: input.S3_BUCKET,
    accessKeyId: input.S3_ACCESS_KEY_ID,
    secretAccessKey: input.S3_SECRET_ACCESS_KEY,
    publicBaseUrl: normalizeS3PublicBaseUrl(input.S3_PUBLIC_BASE_URL),
    signedUrlTtlSeconds: input.S3_SIGNED_URL_TTL_SECONDS ?? 3600
  };
}

export function buildS3SettingsResponse({
  config,
  source,
  updatedAt,
  defaultSignedUrlTtlSeconds = 3600
}: {
  config: StoredS3Config | null;
  source: S3StorageSource;
  updatedAt?: Date | null;
  defaultSignedUrlTtlSeconds?: number;
}): S3StorageSettings {
  return {
    configured: Boolean(config),
    source: config ? source : "none",
    endpoint: config?.endpoint ?? null,
    bucket: config?.bucket ?? null,
    region: config?.region ?? null,
    publicBaseUrl: config?.publicBaseUrl ?? null,
    signedUrlTtlSeconds: config?.signedUrlTtlSeconds ?? defaultSignedUrlTtlSeconds,
    accessKeyConfigured: Boolean(config?.accessKeyId),
    secretKeyConfigured: Boolean(config?.secretAccessKey),
    updatedAt: updatedAt?.toISOString() ?? null
  };
}
