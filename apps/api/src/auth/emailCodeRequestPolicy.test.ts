import { describe, expect, it } from "vitest";
import {
  AUTH_CODE_DEVICE_REQUEST_LIMIT,
  AUTH_CODE_EMAIL_REQUEST_LIMIT,
  AUTH_CODE_IP_REQUEST_LIMIT,
  createCodeRequestDeviceKey,
  createCodeRequestEmailKey,
  createCodeRequestIpKey,
  getCodeRequestStatus
} from "./emailCodeRequestPolicy";

describe("email code request protection", () => {
  const now = new Date("2026-07-18T10:00:00.000Z");

  it("allows a small hourly email allowance and blocks the next request", () => {
    expect(AUTH_CODE_EMAIL_REQUEST_LIMIT).toBe(5);
    expect(AUTH_CODE_DEVICE_REQUEST_LIMIT).toBe(10);
    expect(AUTH_CODE_IP_REQUEST_LIMIT).toBe(20);
    expect(getCodeRequestStatus({ attemptCount: 5, windowStartedAt: now }, 5, now).blocked).toBe(false);
    expect(getCodeRequestStatus({ attemptCount: 6, windowStartedAt: now }, 5, now).blocked).toBe(true);
  });

  it("stores only hashed scope identifiers", () => {
    const values = [
      createCodeRequestEmailKey("person@example.com"),
      createCodeRequestDeviceKey("device-secret"),
      createCodeRequestIpKey("203.0.113.10")
    ];
    for (const value of values) expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(values.join("")).not.toContain("person@example.com");
    expect(values.join("")).not.toContain("203.0.113.10");
  });
});
