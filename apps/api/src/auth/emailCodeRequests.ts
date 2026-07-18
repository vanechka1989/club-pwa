import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { authEmailLoginAttemptLimits } from "../db/schema";
import {
  AUTH_CODE_DEVICE_REQUEST_LIMIT,
  AUTH_CODE_EMAIL_REQUEST_LIMIT,
  AUTH_CODE_IP_REQUEST_LIMIT,
  AUTH_CODE_REQUEST_WINDOW_MS,
  createCodeRequestDeviceKey,
  createCodeRequestEmailKey,
  createCodeRequestIpKey,
  getCodeRequestStatus,
  type CodeRequestStatus
} from "./emailCodeRequestPolicy";

async function incrementRequestBucket(
  scopeKey: string,
  scope: "code_email" | "code_device" | "code_ip",
  limit: number,
  now: Date
) {
  const expiredBeforeSql = new Date(now.getTime() - AUTH_CODE_REQUEST_WINDOW_MS).toISOString();
  const nowSql = now.toISOString();
  const [record] = await db
    .insert(authEmailLoginAttemptLimits)
    .values({ scopeKey, scope, attemptCount: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: authEmailLoginAttemptLimits.scopeKey,
      set: {
        scope,
        attemptCount: sql<number>`case when ${authEmailLoginAttemptLimits.windowStartedAt} <= ${expiredBeforeSql}::timestamptz then 1 else ${authEmailLoginAttemptLimits.attemptCount} + 1 end`,
        windowStartedAt: sql<Date>`case when ${authEmailLoginAttemptLimits.windowStartedAt} <= ${expiredBeforeSql}::timestamptz then ${nowSql}::timestamptz else ${authEmailLoginAttemptLimits.windowStartedAt} end`,
        updatedAt: now
      }
    })
    .returning({
      attemptCount: authEmailLoginAttemptLimits.attemptCount,
      windowStartedAt: authEmailLoginAttemptLimits.windowStartedAt
    });
  return getCodeRequestStatus(record, limit, now);
}

export async function recordEmailCodeRequest(input: {
  email: string;
  deviceToken: string;
  ipAddress: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [email, device, ip] = await Promise.all([
    incrementRequestBucket(createCodeRequestEmailKey(input.email), "code_email", AUTH_CODE_EMAIL_REQUEST_LIMIT, now),
    incrementRequestBucket(createCodeRequestDeviceKey(input.deviceToken), "code_device", AUTH_CODE_DEVICE_REQUEST_LIMIT, now),
    input.ipAddress
      ? incrementRequestBucket(createCodeRequestIpKey(input.ipAddress), "code_ip", AUTH_CODE_IP_REQUEST_LIMIT, now)
      : Promise.resolve<CodeRequestStatus | null>(null)
  ]);
  return { email, device, ip };
}
