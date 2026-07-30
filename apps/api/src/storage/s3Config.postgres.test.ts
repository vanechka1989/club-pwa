import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { resolveMessageMutationTestDatabaseUrl } from "../community/postgresTestGate";
import { getS3ConfigFromSetting, storageSettingKey, type StoredS3Config } from "./s3Config";
import { commitVerifiedS3ConfigurationInDatabase } from "./s3ConfigCommit";

const databaseUrl = resolveMessageMutationTestDatabaseUrl();
const integrationDescribe = databaseUrl ? describe : describe.skip;

function schemaConnectionUrl(url: string, schemaName: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schemaName}`);
  return parsed.toString();
}

integrationDescribe("serialized S3 configuration commit with PostgreSQL", () => {
  const schemaName = `s3_config_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let clientA: Sql;
  let clientB: Sql;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    const scopedUrl = schemaConnectionUrl(databaseUrl!, schemaName);
    clientA = postgres(scopedUrl, { max: 1, onnotice: () => undefined });
    clientB = postgres(scopedUrl, { max: 1, onnotice: () => undefined });
    await clientA.unsafe(`
      create table club_settings (
        key varchar(96) primary key,
        value text not null,
        updated_by_user_id uuid,
        updated_at timestamptz not null default now()
      )
    `);
  });

  afterAll(async () => {
    await Promise.allSettled([clientA?.end(), clientB?.end()]);
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end();
    }
  });

  it("commits exactly one of two concurrent initial physical targets and permits same-target rotation", async () => {
    const databaseA = drizzle(clientA, { schema });
    const databaseB = drizzle(clientB, { schema });
    const base: StoredS3Config = {
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      bucket: "initial-a",
      accessKeyId: "access-a",
      secretAccessKey: "secret-a",
      publicBaseUrl: null,
      signedUrlTtlSeconds: 3600,
      reserve: null
    };
    const other = { ...base, bucket: "initial-b", accessKeyId: "access-b", secretAccessKey: "secret-b" };

    const results = await Promise.allSettled([
      commitVerifiedS3ConfigurationInDatabase({
        database: databaseA,
        currentFallback: null,
        next: base,
        updatedByUserId: null
      }),
      commitVerifiedS3ConfigurationInDatabase({
        database: databaseB,
        currentFallback: null,
        next: other,
        updatedByUserId: null
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const storedRows = await clientA`select value from club_settings where key = ${storageSettingKey}`;
    const stored = getS3ConfigFromSetting(storedRows[0]?.value as string);
    expect([base.bucket, other.bucket]).toContain(stored?.bucket);

    const rotated = { ...stored!, accessKeyId: "rotated", secretAccessKey: "rotated-secret" };
    await expect(commitVerifiedS3ConfigurationInDatabase({
      database: databaseB,
      currentFallback: null,
      next: rotated,
      updatedByUserId: null
    })).resolves.toMatchObject({ key: storageSettingKey });
  });
});
