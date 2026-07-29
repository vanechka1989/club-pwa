import { eq } from "drizzle-orm";
import { db, postgresClient } from "../db/client";
import { clubSettings } from "../db/schema";
import { env } from "../env";
import {
  getS3ConfigFromEnv,
  getS3ConfigFromSetting,
  storageSettingKey
} from "../storage/s3Config";
import { verifyS3Configuration } from "../storage/s3TargetVerifier";

try {
  const setting = await db.query.clubSettings.findFirst({ where: eq(clubSettings.key, storageSettingKey) });
  const config = getS3ConfigFromSetting(setting?.value) ?? getS3ConfigFromEnv(env);
  if (!config) throw new Error("S3 storage is not configured");

  const targets = await verifyS3Configuration(config);
  console.log(JSON.stringify({ ok: true, targets }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await postgresClient.end({ timeout: 5 });
}
