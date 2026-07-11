import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { authSessions, userLoginIps } from "../db/schema";
import { shouldRecordLoginIpChange } from "./loginIpPolicy";

export async function recordLoginIpChange({
  userId,
  sessionId,
  previousIpAddress,
  ipAddress,
  now = new Date()
}: {
  userId: string;
  sessionId: string;
  previousIpAddress: string | null;
  ipAddress: string | null;
  now?: Date;
}) {
  if (!shouldRecordLoginIpChange(previousIpAddress, ipAddress) || !ipAddress) return false;

  const previousIpCondition = previousIpAddress === null
    ? isNull(authSessions.lastIpAddress)
    : eq(authSessions.lastIpAddress, previousIpAddress);

  return db.transaction(async (tx) => {
    const [claimedSession] = await tx
      .update(authSessions)
      .set({ lastIpAddress: ipAddress })
      .where(and(
        eq(authSessions.id, sessionId),
        eq(authSessions.userId, userId),
        previousIpCondition
      ))
      .returning({ id: authSessions.id });

    if (!claimedSession) return false;

    await tx
      .insert(userLoginIps)
      .values({ userId, ipAddress, firstSeenAt: now, lastSeenAt: now, loginCount: 1 })
      .onConflictDoUpdate({
        target: [userLoginIps.userId, userLoginIps.ipAddress],
        set: {
          lastSeenAt: now,
          loginCount: sql`${userLoginIps.loginCount} + 1`
        }
      });

    return true;
  });
}
