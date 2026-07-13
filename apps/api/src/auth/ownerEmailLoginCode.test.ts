import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("owner emergency email login code", () => {
  it("uses the regular login-code storage behind a strict owner guard", () => {
    const adminRoute = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

    expect(adminRoute).toContain('.post("/owner-email-login-code"');
    expect(adminRoute).toContain("const ownerError = await rejectIfNotOwner(c);");
    expect(adminRoute).toContain("normalizeEmail(body.data.email)");
    expect(adminRoute).toContain("authEmailLoginCodes");
    expect(adminRoute).toContain("isNull(authEmailLoginCodes.consumedAt)");
    expect(adminRoute).toContain("owner.email_login_code.generated");
  });

  it("publishes a six-digit one-time response without putting the code into audit metadata", () => {
    const shared = readFileSync(resolve(__dirname, "../../../../packages/shared/src/index.ts"), "utf8");
    const adminRoute = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");
    const auditBlock = adminRoute.match(/action: "owner\.email_login_code\.generated"[\s\S]*?\n\s*}\);/)?.[0] ?? "";

    expect(shared).toContain("ownerEmailLoginCodeResponseSchema");
    expect(shared).toContain("code: z.string().regex(/^\\d{6}$/)");
    expect(adminRoute).toContain("hashAuthToken(`${email}:${code}`)");
    expect(auditBlock).toContain("metadata: { email, expiresAt: expiresAt.toISOString() }");
    expect(auditBlock).not.toContain("code,");
    expect(auditBlock).not.toContain("codeHash");
  });

  it("rate-limits repeated owner generation for the same client", () => {
    const adminRoute = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

    expect(adminRoute).toContain("ownerEmailLoginCodeCooldownSeconds = 30");
    expect(adminRoute).toContain("Сгенерировать новый код можно через");
    expect(adminRoute).toContain("retryAfterSeconds");
  });

  it("serializes generation and atomically consumes a code only once", () => {
    const adminRoute = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");
    const authRoute = readFileSync(resolve(__dirname, "../routes/auth.ts"), "utf8");

    expect(adminRoute).toContain("pg_advisory_xact_lock");
    expect(adminRoute).toMatch(/db\.transaction\([\s\S]*owner\.email_login_code\.generated/);
    expect(authRoute).toMatch(/update\(authEmailLoginCodes\)[\s\S]*isNull\(authEmailLoginCodes\.consumedAt\)[\s\S]*returning/);
    expect(authRoute).not.toContain("where(eq(authEmailLoginCodes.id, loginCode.id))");
  });
});
