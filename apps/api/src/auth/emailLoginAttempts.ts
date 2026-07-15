import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { authEmailLoginAttemptLimits } from "../db/schema";
import {
  AUTH_EMAIL_DEVICE_ATTEMPT_LIMIT,
  AUTH_IP_ATTEMPT_LIMIT,
  AUTH_LOGIN_ATTEMPT_WINDOW_MS,
  createEmailDeviceAttemptKey,
  createIpAttemptKey,
  getLoginAttemptStatus,
  type LoginAttemptStatus
} from "./emailLoginAttemptPolicy";

export type { LoginAttemptStatus } from "./emailLoginAttemptPolicy";

export type EmailLoginAttemptContext = {
  emailDeviceKey: string;
  ipKey: string | null;
  emailDevice: LoginAttemptStatus;
  ip: LoginAttemptStatus | null;
};

async function readAttemptStatus(scopeKey: string, limit: number, now: Date) {
  const record = await db.query.authEmailLoginAttemptLimits.findFirst({
    where: eq(authEmailLoginAttemptLimits.scopeKey, scopeKey)
  });
  return getLoginAttemptStatus(record, limit, now);
}

export async function getEmailLoginAttemptContext(input: {
  email: string;
  deviceToken: string;
  ipAddress: string | null;
  now?: Date;
}): Promise<EmailLoginAttemptContext> {
  const now = input.now ?? new Date();
  const emailDeviceKey = createEmailDeviceAttemptKey(input.email, input.deviceToken);
  const ipKey = input.ipAddress ? createIpAttemptKey(input.ipAddress) : null;
  const [emailDevice, ip] = await Promise.all([
    readAttemptStatus(emailDeviceKey, AUTH_EMAIL_DEVICE_ATTEMPT_LIMIT, now),
    ipKey ? readAttemptStatus(ipKey, AUTH_IP_ATTEMPT_LIMIT, now) : Promise.resolve(null)
  ]);

  return { emailDeviceKey, ipKey, emailDevice, ip };
}

async function incrementAttemptBucket(scopeKey: string, scope: "email_device" | "ip", limit: number, now: Date) {
  const expiredBefore = new Date(now.getTime() - AUTH_LOGIN_ATTEMPT_WINDOW_MS);
  const expiredBeforeSql = expiredBefore.toISOString();
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

  return getLoginAttemptStatus(record, limit, now);
}

export async function recordFailedEmailLoginAttempt(context: EmailLoginAttemptContext, now = new Date()) {
  const [emailDevice, ip] = await Promise.all([
    incrementAttemptBucket(context.emailDeviceKey, "email_device", AUTH_EMAIL_DEVICE_ATTEMPT_LIMIT, now),
    context.ipKey ? incrementAttemptBucket(context.ipKey, "ip", AUTH_IP_ATTEMPT_LIMIT, now) : Promise.resolve(null)
  ]);
  return { emailDevice, ip };
}

export async function clearEmailDeviceLoginAttempts(emailDeviceKey: string) {
  await db.delete(authEmailLoginAttemptLimits).where(eq(authEmailLoginAttemptLimits.scopeKey, emailDeviceKey));
}
