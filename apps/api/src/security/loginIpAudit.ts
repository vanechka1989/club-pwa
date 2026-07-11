import { and, eq, sql } from "drizzle-orm";
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

  await db.transaction(async (tx) => {
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

    await tx
      .update(authSessions)
      .set({ lastIpAddress: ipAddress })
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
  });

  return true;
}
