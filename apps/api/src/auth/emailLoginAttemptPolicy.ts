import { hashAuthToken } from "./emailAuth";

export const AUTH_EMAIL_DEVICE_ATTEMPT_LIMIT = 5;
export const AUTH_IP_ATTEMPT_LIMIT = 25;
export const AUTH_LOGIN_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

type AttemptRecord = {
  attemptCount: number;
  windowStartedAt: Date;
};

export type LoginAttemptStatus = {
  blocked: boolean;
  attemptsRemaining: number;
  retryAfterSeconds: number;
};

export function createEmailDeviceAttemptKey(email: string, deviceToken: string) {
  return hashAuthToken(`email-device:${email}:${deviceToken}`);
}

export function createIpAttemptKey(ipAddress: string) {
  return hashAuthToken(`ip:${ipAddress}`);
}

export function getLoginAttemptStatus(record: AttemptRecord | null | undefined, limit: number, now = new Date()): LoginAttemptStatus {
  if (!record || now.getTime() - record.windowStartedAt.getTime() >= AUTH_LOGIN_ATTEMPT_WINDOW_MS) {
    return { blocked: false, attemptsRemaining: limit, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((record.windowStartedAt.getTime() + AUTH_LOGIN_ATTEMPT_WINDOW_MS - now.getTime()) / 1000)
  );
  return {
    blocked: record.attemptCount >= limit,
    attemptsRemaining: Math.max(0, limit - record.attemptCount),
    retryAfterSeconds
  };
}
