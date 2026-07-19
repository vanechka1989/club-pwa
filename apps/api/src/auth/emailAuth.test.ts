import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildEmailLoginMessage,
  createLoginCode,
  getEmailLoginCodeCooldownSeconds,
  hasPwaStandaloneAuthHeader,
  hashAuthToken,
  normalizeEmail,
  pwaInstallRequiredMessage,
  pwaStandaloneAuthHeaderName
} from "./emailAuth";

const authRouteSource = readFileSync(new URL("../routes/auth.ts", import.meta.url), "utf8");

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

  it("builds a branded HTML login email with a safe text fallback", () => {
    const message = buildEmailLoginMessage({
      code: "073567",
      expiresInMinutes: 10,
      webOrigin: "https://club2.myn8nservertest.ru"
    });

    expect(message.subject).toBe("Код входа в клуб");
    expect(message.text).toContain("073567");
    expect(message.text).toContain("10 минут");
    expect(message.html).toContain(">073567</div>");
    expect(message.html).not.toContain("073 567");
    expect(message.html).toContain("https://club2.myn8nservertest.ru/icons/icon-192.png");
    expect(message.html).not.toContain('href="https://club2.myn8nservertest.ru"');
    expect(message.html).not.toContain(">Открыть приложение</a>");
    expect(message.text).not.toContain("Открыть приложение:");
    expect(message.html).toContain("Скопируйте код для авторизации в клубе");
    expect(message.html).not.toContain("Нажмите и удерживайте код");
    expect(message.html).not.toContain("073567?");
    expect(message.html).not.toMatch(/<script|onclick=|clipboard/i);
    expect(message.text.toLowerCase()).not.toContain("telegram");
  });

  it("rejects unsafe login email inputs before building HTML", () => {
    expect(() =>
      buildEmailLoginMessage({
        code: "12345x",
        expiresInMinutes: 10,
        webOrigin: "https://club.example"
      })
    ).toThrow("six digits");
    expect(() =>
      buildEmailLoginMessage({
        code: "123456",
        expiresInMinutes: 10,
        webOrigin: "javascript:alert(1)"
      })
    ).toThrow("http or https");
  });

  it("uses the configured public web origin for login emails", () => {
    expect(authRouteSource).toContain("webOrigin: env.WEB_ORIGIN");
  });

  it("requires a one minute pause before issuing another login code", () => {
    const issuedAt = new Date("2026-07-06T09:00:00.000Z");

    expect(getEmailLoginCodeCooldownSeconds(issuedAt, new Date("2026-07-06T09:00:00.000Z"))).toBe(60);
    expect(getEmailLoginCodeCooldownSeconds(issuedAt, new Date("2026-07-06T09:00:59.000Z"))).toBe(1);
    expect(getEmailLoginCodeCooldownSeconds(issuedAt, new Date("2026-07-06T09:01:00.000Z"))).toBe(0);
  });

  it("requires an installed PWA marker for email auth requests", () => {
    expect(pwaStandaloneAuthHeaderName).toBe("X-Club-PWA-Standalone");
    expect(hasPwaStandaloneAuthHeader("1")).toBe(true);
    expect(hasPwaStandaloneAuthHeader("true")).toBe(false);
    expect(hasPwaStandaloneAuthHeader(null)).toBe(false);
    expect(pwaInstallRequiredMessage).toContain("установленного приложения");
  });
});
