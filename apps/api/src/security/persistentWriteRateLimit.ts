import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { db as defaultDatabase } from "../db/client";
import { authEmailLoginAttemptLimits } from "../db/schema";
import type { AuthVariables } from "../middleware/auth";
import { getWriteRateLimitPolicy } from "./writeRateLimitPolicy";

function createScopeKey(scope: string, userId: string) {
  return createHash("sha256").update(`product-write:${scope}:${userId}`).digest("hex");
}

type RateLimitDatabase = Pick<typeof defaultDatabase, "insert">;

export async function consumePersistentWriteAllowance(
  scope: string,
  userId: string,
  limit: number,
  windowMs: number,
  options: { database?: RateLimitDatabase; now?: Date } = {}
) {
  const database = options.database ?? (await import("../db/client")).db;
  const now = options.now ?? new Date();
  const scopeKey = createScopeKey(scope, userId);
  const expiredBefore = new Date(now.getTime() - windowMs).toISOString();
  const nowSql = now.toISOString();
  const [record] = await database
    .insert(authEmailLoginAttemptLimits)
    .values({ scopeKey, scope: `write_${scope}`, attemptCount: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: authEmailLoginAttemptLimits.scopeKey,
      set: {
        scope: `write_${scope}`,
        attemptCount: sql<number>`case when ${authEmailLoginAttemptLimits.windowStartedAt} <= ${expiredBefore}::timestamptz then 1 else ${authEmailLoginAttemptLimits.attemptCount} + 1 end`,
        windowStartedAt: sql<Date>`case when ${authEmailLoginAttemptLimits.windowStartedAt} <= ${expiredBefore}::timestamptz then ${nowSql}::timestamptz else ${authEmailLoginAttemptLimits.windowStartedAt} end`,
        updatedAt: now
      }
    })
    .returning({ attemptCount: authEmailLoginAttemptLimits.attemptCount, windowStartedAt: authEmailLoginAttemptLimits.windowStartedAt });

  const allowed = (record?.attemptCount ?? limit + 1) <= limit;
  const retryAfterSeconds = Math.max(1, Math.ceil(((record?.windowStartedAt.getTime() ?? now.getTime()) + windowMs - now.getTime()) / 1000));
  return { allowed, retryAfterSeconds };
}

export const persistentWriteRateLimit: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const policy = getWriteRateLimitPolicy(c.req.method, c.req.path);
  if (!policy) return next();
  const result = await consumePersistentWriteAllowance(policy.scope, c.get("userId"), policy.limit, policy.windowMs);
  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfterSeconds));
    return c.json({ error: "Too many requests", retryAfterSeconds: result.retryAfterSeconds }, 429);
  }
  await next();
};
