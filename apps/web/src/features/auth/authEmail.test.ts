import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email auth UI", () => {
  it("uses email auth endpoints instead of Telegram initData", () => {
    const client = readFileSync(resolve(process.cwd(), "src/api/client.ts"), "utf8");
    const session = readFileSync(resolve(process.cwd(), "src/stores/session.ts"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/App.vue"), "utf8");

    expect(client).toContain('"/auth/email/start"');
    expect(client).toContain('"/auth/email/verify"');
    expect(client).toContain('credentials: "include"');
    expect(client).not.toContain("initData");
    expect(client).not.toContain("X-Dev-Telegram-User");
    expect(session).toContain("requestEmailCode");
    expect(session).toContain("verifyEmailCode");
    expect(app).toContain("AuthSection");
  });
});
