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
});
