import {
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { StoredS3Config } from "./s3Config";
import {
  createS3ConfigurationVerifier,
  verifyS3TargetCapabilities,
  type S3LifecycleRule
} from "./s3Lifecycle";
import { probeS3AllVersionDeletion } from "./s3DeletionProbe";

function createS3VerifierClient(config: StoredS3Config) {
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

async function verifyS3Target(target: "primary" | "reserve", config: StoredS3Config) {
  const client = createS3VerifierClient(config);
  try {
    const [lifecycle, versioning] = await Promise.all([
      client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: config.bucket })),
      client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }))
    ]);
    return await verifyS3TargetCapabilities({
      target,
      bucket: config.bucket,
      lifecycleRules: (lifecycle.Rules ?? []) as S3LifecycleRule[],
      versioning: versioning.Status ?? "Unversioned",
      probe: () => probeS3AllVersionDeletion(target, config)
    });
  } finally {
    client.destroy();
  }
}

export const verifyS3Configuration = createS3ConfigurationVerifier(verifyS3Target);
