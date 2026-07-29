import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schemaDefinition from "../db/schema";
import { resolveCommunityIntegrationTestConfig } from "../community/postgresTestGate";
import { consumePersistentCommunityReadAllowance } from "./persistentCommunityReadRateLimit";
import { consumePersistentWriteAllowance } from "./persistentWriteRateLimit";

const databaseUrl = resolveCommunityIntegrationTestConfig()?.postgres.messageMutationDatabaseUrl;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const windowStartedAt = new Date("2026-07-29T12:00:00.000Z");

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("community persistent rate limits with PostgreSQL", () => {
  const schema = `community_rate_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let client: Sql;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schema}"`);
    client = postgres(schemaConnectionUrl(databaseUrl!, schema), { max: 20, onnotice: () => undefined });
    await client.unsafe(`
      create table auth_email_login_attempt_limits (
        scope_key varchar(64) primary key,
        scope varchar(24) not null,
        attempt_count integer not null default 1,
        window_started_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    database = drizzle(client, { schema: schemaDefinition });
  }, 30_000);

  beforeEach(async () => {
    await client.unsafe("truncate auth_email_login_attempt_limits");
  });

  afterAll(async () => {
    await client?.end({ timeout: 1 });
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schema}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  it("enforces the exact search, context, and community-write thresholds", async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      await expect(consumePersistentCommunityReadAllowance("search", userA, 30, 60_000, {
        database,
        now: windowStartedAt
      })).resolves.toEqual({ allowed: true, retryAfterSeconds: 60 });
    }
    await expect(consumePersistentCommunityReadAllowance("search", userA, 30, 60_000, {
      database,
      now: windowStartedAt
    })).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      expect((await consumePersistentCommunityReadAllowance("context", userA, 60, 60_000, {
        database,
        now: windowStartedAt
      })).allowed).toBe(true);
      expect((await consumePersistentWriteAllowance("community", userA, 60, 60_000, {
        database,
        now: windowStartedAt
      })).allowed).toBe(true);
    }
    expect((await consumePersistentCommunityReadAllowance("context", userA, 60, 60_000, {
      database,
      now: windowStartedAt
    })).allowed).toBe(false);
    expect((await consumePersistentWriteAllowance("community", userA, 60, 60_000, {
      database,
      now: windowStartedAt
    })).allowed).toBe(false);
  });

  it("isolates users, read scopes, and write scopes", async () => {
    expect((await consumePersistentCommunityReadAllowance("search", userA, 1, 60_000, { database, now: windowStartedAt })).allowed).toBe(true);
    expect((await consumePersistentCommunityReadAllowance("search", userA, 1, 60_000, { database, now: windowStartedAt })).allowed).toBe(false);
    expect((await consumePersistentCommunityReadAllowance("search", userB, 1, 60_000, { database, now: windowStartedAt })).allowed).toBe(true);
    expect((await consumePersistentCommunityReadAllowance("context", userA, 1, 60_000, { database, now: windowStartedAt })).allowed).toBe(true);
    expect((await consumePersistentWriteAllowance("community", userA, 1, 60_000, { database, now: windowStartedAt })).allowed).toBe(true);
  });

  it("resets the counter exactly at the next window", async () => {
    expect((await consumePersistentCommunityReadAllowance("search", userA, 1, 60_000, { database, now: windowStartedAt })).allowed).toBe(true);
    expect((await consumePersistentCommunityReadAllowance("search", userA, 1, 60_000, {
      database,
      now: new Date(windowStartedAt.getTime() + 59_999)
    })).allowed).toBe(false);
    await expect(consumePersistentCommunityReadAllowance("search", userA, 1, 60_000, {
      database,
      now: new Date(windowStartedAt.getTime() + 60_000)
    })).resolves.toEqual({ allowed: true, retryAfterSeconds: 60 });
  });

  it("increments one key atomically under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () =>
      consumePersistentCommunityReadAllowance("search", userA, 30, 60_000, {
        database,
        now: windowStartedAt
      })));
    expect(results.filter((result) => result.allowed)).toHaveLength(30);
    expect(results.filter((result) => !result.allowed)).toHaveLength(10);
    const [row] = await client<{ attemptCount: number }[]>`
      select attempt_count as "attemptCount" from auth_email_login_attempt_limits
    `;
    expect(row?.attemptCount).toBe(40);
  });
});
