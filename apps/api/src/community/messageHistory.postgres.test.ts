import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeSearchCursor, encodeSearchCursor, type SearchCursor } from "./messageSearch";
import { resolveMessageMutationTestDatabaseUrl } from "./postgresTestGate";

const databaseUrl = resolveMessageMutationTestDatabaseUrl();
const integrationDescribe = databaseUrl ? describe : describe.skip;

function schemaConnectionUrl(url: string, schema: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

integrationDescribe("exact community history pagination with PostgreSQL", () => {
  const schemaName = `history_tuple_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let admin: Sql;
  let client: Sql;

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema "${schemaName}"`);
    client = postgres(schemaConnectionUrl(databaseUrl!, schemaName), { max: 1, onnotice: () => undefined });
    await client.unsafe(`
      create table club_chat_messages (
        id uuid primary key,
        topic_id uuid not null,
        created_at timestamptz not null
      )
    `);
  }, 30_000);

  afterAll(async () => {
    await client?.end({ timeout: 1 });
    if (admin) {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await admin.end({ timeout: 1 });
    }
  });

  it("visits more than one hundred equal-millisecond rows exactly once across pages", async () => {
    const topicId = "00000000-0000-4000-8000-000000000010";
    const ids = Array.from({ length: 153 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`);
    for (const [index, id] of ids.entries()) {
      const micros = String(123_000 + (index % 900)).padStart(6, "0");
      await client`
        insert into club_chat_messages (id, topic_id, created_at)
        values (${id}, ${topicId}, ${`2026-07-29T12:00:00.${micros}Z`})
      `;
    }

    const seen: string[] = [];
    let before: SearchCursor | null = null;
    do {
      const rows: Array<{ id: string; cursorCreatedAt: string }> = before
        ? await client<{ id: string; cursorCreatedAt: string }[]>`
            select id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorCreatedAt"
            from club_chat_messages
            where topic_id = ${topicId}
              and (created_at < ${before.createdAt}::timestamptz
                   or (created_at = ${before.createdAt}::timestamptz and id < ${before.messageId}))
            order by created_at desc, id desc
            limit 50
          `
        : await client<{ id: string; cursorCreatedAt: string }[]>`
            select id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorCreatedAt"
            from club_chat_messages
            where topic_id = ${topicId}
            order by created_at desc, id desc
            limit 50
          `;
      seen.push(...rows.map((row) => row.id));
      const last = rows.at(-1);
      before = rows.length === 50 && last
        ? decodeSearchCursor(encodeSearchCursor({ createdAt: last.cursorCreatedAt, messageId: last.id }))
        : null;
    } while (before);

    expect(seen).toHaveLength(ids.length);
    expect(new Set(seen).size).toBe(ids.length);
  });
});
