import { describe, expect, it } from "vitest";
import { getTrustedClientIp, normalizeIpAddress } from "./clientIp";

describe("trusted client IP", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["203.0.113.7:443", "203.0.113.7"],
    ["2001:db8::7", "2001:db8::7"],
    ["[2001:db8::7]:443", "2001:db8::7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["not-an-ip", null]
  ])("normalizes %s", (value, expected) => {
    expect(normalizeIpAddress(value)).toBe(expected);
  });

  it("uses the client address overwritten by the trusted proxy", () => {
    expect(getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.10" }))).toBe("203.0.113.9");
  });
});
