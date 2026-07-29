import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

describe("granular admin community access", () => {
  it("gates every combined admin chat surface and chat moderation mutation on community access", () => {
    expect(source).toContain("const communityStats = adminAccess.community.allowed");
    expect(source).toContain("buildUserDetail(user, adminAccess.community)");
    expect(source).toContain("adminAccess.community.allowed\n        ? db.query.clubChatMessages.findMany");
    expect(source).toContain('kind === "chat_message" && !adminAccess.community.allowed');
  });

  it("uses precise timestamps and deterministic created_at/id ordering on every admin message query", () => {
    expect(source.match(/preciseCommunityMessageCreatedAtExtra\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/desc\(table\.createdAt\), desc\(table\.id\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).not.toContain("createdAt: message.createdAt.toISOString()");
  });
});
