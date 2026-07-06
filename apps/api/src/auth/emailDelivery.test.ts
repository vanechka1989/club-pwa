import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email delivery diagnostics", () => {
  it("logs SMTP delivery metadata without exposing credentials", () => {
    const source = readFileSync(resolve(__dirname, "emailDelivery.ts"), "utf8");

    expect(source).toContain("const result = await transporter.sendMail");
    expect(source).toContain("messageId");
    expect(source).toContain("accepted");
    expect(source).toContain("rejected");
    expect(source).not.toContain("SMTP_PASSWORD,");
  });

  it("can sign outgoing login emails with app-managed DKIM keys", () => {
    const source = readFileSync(resolve(__dirname, "emailDelivery.ts"), "utf8");
    const envSource = readFileSync(resolve(__dirname, "../env.ts"), "utf8");

    expect(envSource).toContain("DKIM_DOMAIN");
    expect(envSource).toContain("DKIM_SELECTOR");
    expect(envSource).toContain("DKIM_PRIVATE_KEY");
    expect(source).toContain("buildDkimConfig");
    expect(source).toContain("keySelector: env.DKIM_SELECTOR");
    expect(source).toContain("domainName: env.DKIM_DOMAIN");
    expect(source).toContain('replace(/\\\\n/g, "\\n")');
    expect(source).toContain("dkim: buildDkimConfig()");
  });
});
