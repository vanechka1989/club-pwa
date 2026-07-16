export type RedisReadiness = { configured: boolean; ready: boolean };

export async function collectReadiness(checks: {
  checkDatabase: () => Promise<boolean>;
  checkRedis: () => Promise<RedisReadiness>;
}) {
  const [database, redis] = await Promise.all([
    checks.checkDatabase().catch(() => false),
    checks.checkRedis().catch(() => ({ configured: true, ready: false }))
  ]);

  return {
    ok: database && redis.ready,
    database,
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
    checkRedis: checkCommunityRedisReady
  });
}
