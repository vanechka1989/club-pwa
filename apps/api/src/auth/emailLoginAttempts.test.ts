import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_EMAIL_DEVICE_ATTEMPT_LIMIT,
  AUTH_IP_ATTEMPT_LIMIT,
  AUTH_LOGIN_ATTEMPT_WINDOW_MS,
  createEmailDeviceAttemptKey,
  createIpAttemptKey,
  getLoginAttemptStatus
} from "./emailLoginAttemptPolicy";

describe("email login attempt protection", () => {
  const now = new Date("2026-07-16T10:00:00.000Z");

  it("allows five attempts per email and device within one hour", () => {
    expect(AUTH_EMAIL_DEVICE_ATTEMPT_LIMIT).toBe(5);
    expect(AUTH_LOGIN_ATTEMPT_WINDOW_MS).toBe(60 * 60 * 1000);

    expect(
      getLoginAttemptStatus({ attemptCount: 4, windowStartedAt: new Date("2026-07-16T09:30:00.000Z") }, 5, now)
    ).toEqual({ blocked: false, attemptsRemaining: 1, retryAfterSeconds: 1800 });
    expect(
      getLoginAttemptStatus({ attemptCount: 5, windowStartedAt: new Date("2026-07-16T09:30:00.000Z") }, 5, now)
    ).toEqual({ blocked: true, attemptsRemaining: 0, retryAfterSeconds: 1800 });
  });

  it("starts a fresh allowance after the rolling window expires", () => {
    expect(
      getLoginAttemptStatus({ attemptCount: 12, windowStartedAt: new Date("2026-07-16T08:59:59.000Z") }, 5, now)
    ).toEqual({ blocked: false, attemptsRemaining: 5, retryAfterSeconds: 0 });
  });

  it("adds a broader IP ceiling without storing raw identifiers", () => {
    expect(AUTH_IP_ATTEMPT_LIMIT).toBe(25);
    const deviceKey = createEmailDeviceAttemptKey("ivan@example.com", "device-secret");
    const ipKey = createIpAttemptKey("203.0.113.9");

    expect(deviceKey).toMatch(/^[a-f0-9]{64}$/);
    expect(ipKey).toMatch(/^[a-f0-9]{64}$/);
    expect(deviceKey).not.toContain("ivan@example.com");
    expect(ipKey).not.toContain("203.0.113.9");
  });

  it("persists attempt buckets and uses them in the verification route", () => {
    const schema = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/routes/auth.ts"), "utf8");

    expect(schema).toContain('pgTable("auth_email_login_attempt_limits"');
    expect(route).toContain("getEmailLoginAttemptContext");
    expect(route).toContain("recordFailedEmailLoginAttempt");
    expect(route).toContain("clearEmailDeviceLoginAttempts");
    expect(route).toContain('code: "AUTH_INVALID_CODE"');
    expect(route).toContain('code: "AUTH_TOO_MANY_ATTEMPTS"');
  });
});
