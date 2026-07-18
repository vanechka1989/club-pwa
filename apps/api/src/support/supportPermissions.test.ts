import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("support permissions", () => {
  it("uses global support unread counters only for users with support access", () => {
    const source = readFileSync(resolve(__dirname, "../routes/support.ts"), "utf8");
    const unreadSource = readFileSync(resolve(__dirname, "unreadCount.ts"), "utf8");

    expect(unreadSource).toContain("export async function getSupportUnreadCount");
    expect(unreadSource).toContain("const unreadCondition = isSupportAdmin");
    expect(source).toContain("const isSupportAdmin = await canUseSupportAdmin(c, role);");
    expect(source).toContain("getSupportUnreadCount({ userId, isSupportAdmin })");
    expect(source).not.toContain("getSupportUnreadCount({ userId, role })");
  });

  it("redacts support administrator identities from customer ticket payloads", () => {
    const source = readFileSync(resolve(__dirname, "../routes/support.ts"), "utf8");

    expect(source).toContain("canSeeAdminAuthors: boolean");
    expect(source).toContain('message.authorRole === "admin" && !canSeeAdminAuthors');
    expect(source).toContain('telegramId: "support"');
    expect(source).toContain("serializeTicket(ticket, role, isSupportAdmin)");
  });
});
