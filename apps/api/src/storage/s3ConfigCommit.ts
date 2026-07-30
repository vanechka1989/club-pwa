import { eq, sql } from "drizzle-orm";
import { clubSettings } from "../db/schema";
import {
  createSerializedS3ConfigurationCommit,
  getS3ConfigFromSetting,
  storageSettingKey,
  type StoredS3Config
} from "./s3Config";

type S3ConfigCommitDatabase = (typeof import("../db/client"))["db"];

export async function commitVerifiedS3ConfigurationInDatabase(input: {
  database: S3ConfigCommitDatabase;
  currentFallback: StoredS3Config | null;
  next: StoredS3Config;
  updatedByUserId: string | null;
}) {
  let savedSetting: typeof clubSettings.$inferSelect | undefined;
  const commit = createSerializedS3ConfigurationCommit({
    currentFallback: input.currentFallback,
    runExclusive: (work) => input.database.transaction(async (transaction) => {
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${storageSettingKey}, 0))
      `);
      const lockedSetting = await transaction.query.clubSettings.findFirst({
        where: eq(clubSettings.key, storageSettingKey)
      });
      return work(getS3ConfigFromSetting(lockedSetting?.value), async (candidate) => {
        const now = new Date();
        [savedSetting] = await transaction
          .insert(clubSettings)
          .values({
            key: storageSettingKey,
            value: JSON.stringify(candidate),
            updatedByUserId: input.updatedByUserId,
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: clubSettings.key,
            set: {
              value: JSON.stringify(candidate),
              updatedByUserId: input.updatedByUserId,
              updatedAt: now
            }
          })
          .returning();
      });
    })
  });
  await commit(input.next);
  if (!savedSetting) throw new Error("s3_configuration_commit_failed");
  return savedSetting;
}
