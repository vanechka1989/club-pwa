import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { authEmailLoginAttemptLimits } from "../db/schema";
import type { AuthVariables } from "../middleware/auth";
import type { db as defaultDatabase } from "../db/client";

type CommunityReadScope = "search" | "context";
type ConsumeResult = { allowed: boolean; retryAfterSeconds: number };
type ConsumeCommunityReadAllowance = (
  scope: CommunityReadScope,
  userId: string,
  limit: number,
  windowMs: number
) => Promise<ConsumeResult>;

export type CommunityReadRateLimitPolicy = {
  scope: CommunityReadScope;
  limit: number;
  windowMs: number;
};

export function getCommunityReadRateLimitPolicy(method: string, path: string): CommunityReadRateLimitPolicy | null {
  if (method.toUpperCase() !== "GET") return null;
  const localPath = path.replace(/^\/community(?=\/|$)/, "");
  if (localPath === "/messages/search") return { scope: "search", limit: 30, windowMs: 60_000 };
  if (/^\/topics\/[^/]+\/messages\/[^/]+\/context$/.test(localPath)) {
    return { scope: "context", limit: 60, windowMs: 60_000 };
  }
  return null;
}

function createScopeKey(scope: CommunityReadScope, userId: string) {
  return createHash("sha256").update(`community-read:${scope}:${userId}`).digest("hex");
}

type RateLimitDatabase = Pick<typeof defaultDatabase, "insert">;

export async function consumePersistentCommunityReadAllowance(
  scope: CommunityReadScope,
  userId: string,
  limit: number,
  windowMs: number,
  options: { database?: RateLimitDatabase; now?: Date } = {}
): Promise<ConsumeResult> {
  const database = options.database ?? (await import("../db/client")).db;
  const now = options.now ?? new Date();
  const expiredBefore = new Date(now.getTime() - windowMs).toISOString();
  const nowSql = now.toISOString();
  const [record] = await database
    .insert(authEmailLoginAttemptLimits)
    .values({
      scopeKey: createScopeKey(scope, userId),
      scope: `read_${scope}`,
      attemptCount: 1,
      windowStartedAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: authEmailLoginAttemptLimits.scopeKey,
      set: {
        scope: `read_${scope}`,
        attemptCount: sql<number>`case when ${authEmailLoginAttemptLimits.windowStartedAt} <= ${expiredBefore}::timestamptz then 1 else ${authEmailLoginAttemptLimits.attemptCount} + 1 end`,
        windowStartedAt: sql<Date>`case when ${authEmailLoginAttemptLimits.windowStartedAt} <= ${expiredBefore}::timestamptz then ${nowSql}::timestamptz else ${authEmailLoginAttemptLimits.windowStartedAt} end`,
        updatedAt: now
      }
    })
    .returning({
      attemptCount: authEmailLoginAttemptLimits.attemptCount,
      windowStartedAt: authEmailLoginAttemptLimits.windowStartedAt
    });

  const allowed = (record?.attemptCount ?? limit + 1) <= limit;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((record?.windowStartedAt.getTime() ?? now.getTime()) + windowMs - now.getTime()) / 1000)
  );
  return { allowed, retryAfterSeconds };
}

export function createPersistentCommunityReadRateLimit(
  consume: ConsumeCommunityReadAllowance = consumePersistentCommunityReadAllowance
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const policy = getCommunityReadRateLimitPolicy(c.req.method, c.req.path);
    if (!policy) return next();
    const result = await consume(policy.scope, c.get("userId"), policy.limit, policy.windowMs);
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json({ error: "Too many requests", retryAfterSeconds: result.retryAfterSeconds }, 429);
    }
    await next();
  };
}

export const persistentCommunityReadRateLimit = createPersistentCommunityReadRateLimit();
