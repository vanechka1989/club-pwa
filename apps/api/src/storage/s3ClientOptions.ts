import type { S3ClientConfig } from "@aws-sdk/client-s3";
import type { StoredS3Config } from "./s3Config";

export function buildS3ClientOptions(config: StoredS3Config): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  };
}
