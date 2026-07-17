import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("support permissions", () => {
  it("uses global support unread counters only for users with support access", () => {
    const source = readFileSync(resolve(__dirname, "../routes/support.ts"), "utf8");

    expect(source).toContain(
      "async function getUnreadCount({ userId, isSupportAdmin }: { userId: string; isSupportAdmin: boolean })"
    );
    expect(source).toContain("if (isSupportAdmin)");
    expect(source).toContain("const isSupportAdmin = await canUseSupportAdmin(c, role);");
    expect(source).toContain("getUnreadCount({ userId, isSupportAdmin })");
    expect(source).not.toContain("getUnreadCount({ userId, role })");
  });

  it("redacts support administrator identities from customer ticket payloads", () => {
    const source = readFileSync(resolve(__dirname, "../routes/support.ts"), "utf8");

    expect(source).toContain("canSeeAdminAuthors: boolean");
    expect(source).toContain('message.authorRole === "admin" && !canSeeAdminAuthors');
    expect(source).toContain('telegramId: "support"');
    expect(source).toContain("serializeTicket(ticket, role, isSupportAdmin)");
  });
});
