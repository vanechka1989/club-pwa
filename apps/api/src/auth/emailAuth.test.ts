import { describe, expect, it } from "vitest";
import { buildEmailLoginMessage, createLoginCode, getEmailLoginCodeCooldownSeconds, hashAuthToken, normalizeEmail } from "./emailAuth";

describe("email auth", () => {
  it("normalizes email addresses before identity lookup", () => {
    expect(normalizeEmail("  Ivan.Club@Example.COM  ")).toBe("ivan.club@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });

  it("creates short numeric login codes for email delivery", () => {
    const code = createLoginCode();

    expect(code).toMatch(/^\d{6}$/);
  });

  it("hashes session and login tokens without keeping raw secrets", () => {
    expect(hashAuthToken("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAuthToken("secret-token")).toBe(hashAuthToken("secret-token"));
    expect(hashAuthToken("other-token")).not.toBe(hashAuthToken("secret-token"));
  });

  it("builds a PWA login email without Telegram wording", () => {
    const message = buildEmailLoginMessage({ code: "123456", expiresInMinutes: 10 });

    expect(message.subject).toBe("Код входа в клуб");
    expect(message.text).toContain("123456");
    expect(message.text).toContain("10 минут");
    expect(message.text.toLowerCase()).not.toContain("telegram");
  });

  it("requires a one minute pause before issuing another login code", () => {
    const issuedAt = new Date("2026-07-06T09:00:00.000Z");

    expect(getEmailLoginCodeCooldownSeconds(issuedAt, new Date("2026-07-06T09:00:00.000Z"))).toBe(60);
    expect(getEmailLoginCodeCooldownSeconds(issuedAt, new Date("2026-07-06T09:00:59.000Z"))).toBe(1);
    expect(getEmailLoginCodeCooldownSeconds(issuedAt, new Date("2026-07-06T09:01:00.000Z"))).toBe(0);
  });
});
