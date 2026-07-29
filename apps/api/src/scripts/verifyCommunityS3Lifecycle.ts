import { GetBucketLifecycleConfigurationCommand, GetBucketVersioningCommand, S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "../db/client";
import { clubSettings } from "../db/schema";
import { env } from "../env";
import {
  getS3ConfigFromEnv,
  getS3ConfigFromSetting,
  storageSettingKey,
  type StoredS3Config
} from "../storage/s3Config";
import { validateCommunityLifecycleRules, type S3LifecycleRule } from "../storage/s3Lifecycle";
import { probeS3AllVersionDeletion } from "../storage/s3DeletionProbe";

function createClient(config: StoredS3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    maxAttempts: 2,
    requestHandler: new NodeHttpHandler({ connectionTimeout: 5_000, socketTimeout: 120_000 })
  });
}

async function verifyTarget(label: "primary" | "reserve", config: StoredS3Config) {
  const client = createClient(config);
  try {
    const [response, versioningResponse] = await Promise.all([
      client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: config.bucket })),
      client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }))
    ]);
    const result = validateCommunityLifecycleRules((response.Rules ?? []) as S3LifecycleRule[]);
    if (!result.ok) {
      throw new Error(`${label} bucket ${config.bucket}: ${result.errors.join("; ")}`);
    }
    const versioning = versioningResponse.Status ?? "Unversioned";
    if (versioning !== "Enabled") {
      throw new Error(`${label} bucket ${config.bucket}: versioning must be Enabled for convergent privacy deletion`);
    }
    const deletionProbe = await probeS3AllVersionDeletion(label, config);
    return {
      target: label,
      bucket: config.bucket,
      lifecycle: "verified",
      versioning,
      deletion: "all-versions-and-delete-markers",
      deletionProbe
    };
  } finally {
    client.destroy();
  }
}

try {
  const setting = await db.query.clubSettings.findFirst({ where: eq(clubSettings.key, storageSettingKey) });
  const config = getS3ConfigFromSetting(setting?.value) ?? getS3ConfigFromEnv(env);
  if (!config) throw new Error("S3 storage is not configured");

  const targets = [
    await verifyTarget("primary", config),
    ...(config.reserve
      ? [await verifyTarget("reserve", { ...config.reserve, signedUrlTtlSeconds: config.signedUrlTtlSeconds, reserve: null })]
      : [])
  ];
  console.log(JSON.stringify({ ok: true, targets }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await postgresClient.end({ timeout: 5 });
}
