export type RedisReadiness = { configured: boolean; ready: boolean };

export async function collectReadiness(checks: {
  checkDatabase: () => Promise<boolean>;
  checkSchema: () => Promise<boolean>;
  checkRedis: () => Promise<RedisReadiness>;
}) {
  const [database, schema, redis] = await Promise.all([
    checks.checkDatabase().catch(() => false),
    checks.checkSchema().catch(() => false),
    checks.checkRedis().catch(() => ({ configured: true, ready: false }))
  ]);

  return {
    ok: database && schema && redis.ready,
    database,
    schema,
    redis
  };
}

export async function checkApplicationReadiness() {
  const [{ postgresClient }, { checkCommunityRedisReady }] = await Promise.all([
    import("./db/client"),
    import("./community/realtimeRedis")
  ]);

  return collectReadiness({
    checkDatabase: async () => {
      const rows = await postgresClient<{ ok: number }[]>`select 1 as ok`;
      return rows[0]?.ok === 1;
    },
    checkSchema: async () => {
      const rows = await postgresClient<{ ready: boolean }[]>`
        select (
          to_regclass('community_object_publications') is not null
          and to_regclass('community_notification_outbox') is not null
          and to_regclass('community_object_lifecycles') is not null
          and to_regprocedure('community_enqueue_message_cleanup(uuid,text)') is not null
          and exists (
            select 1 from information_schema.columns
            where table_schema = current_schema()
              and table_name = 'club_chat_messages' and column_name = 'terminal_cleanup_at'
          )
          and exists (
            select 1 from information_schema.columns
            where table_schema = current_schema()
              and table_name = 'community_object_lifecycles' and column_name = 'publication_token'
          )
          and exists (
            select 1 from information_schema.columns
            where table_schema = current_schema()
              and table_name = 'community_object_lifecycles' and column_name = 'hot_until'
          )
          and exists (
            select 1 from information_schema.columns
            where table_schema = current_schema()
              and table_name = 'community_object_lifecycles' and column_name = 'cold_at'
          )
          and (
            select coalesce(max(created_at), 0)
            from drizzle.__drizzle_migrations
          ) >= 1785459600000
        ) as ready
      `;
      return rows[0]?.ready === true;
    },
    checkRedis: checkCommunityRedisReady
  });
}
