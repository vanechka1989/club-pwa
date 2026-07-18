import { hashAuthToken } from "./emailAuth";

export const AUTH_CODE_EMAIL_REQUEST_LIMIT = 5;
export const AUTH_CODE_DEVICE_REQUEST_LIMIT = 10;
export const AUTH_CODE_IP_REQUEST_LIMIT = 20;
export const AUTH_CODE_REQUEST_WINDOW_MS = 60 * 60 * 1000;

type RequestRecord = { attemptCount: number; windowStartedAt: Date };
export type CodeRequestStatus = { blocked: boolean; attemptsRemaining: number; retryAfterSeconds: number };

export function createCodeRequestEmailKey(email: string) {
  return hashAuthToken(`code-request-email:${email}`);
}

export function createCodeRequestDeviceKey(deviceToken: string) {
  return hashAuthToken(`code-request-device:${deviceToken}`);
}

export function createCodeRequestIpKey(ipAddress: string) {
  return hashAuthToken(`code-request-ip:${ipAddress}`);
}

export function getCodeRequestStatus(
  record: RequestRecord | null | undefined,
  limit: number,
  now = new Date()
): CodeRequestStatus {
  if (!record || now.getTime() - record.windowStartedAt.getTime() >= AUTH_CODE_REQUEST_WINDOW_MS) {
    return { blocked: false, attemptsRemaining: limit, retryAfterSeconds: 0 };
  }
  return {
    blocked: record.attemptCount > limit,
    attemptsRemaining: Math.max(0, limit - record.attemptCount),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((record.windowStartedAt.getTime() + AUTH_CODE_REQUEST_WINDOW_MS - now.getTime()) / 1000)
    )
  };
}
