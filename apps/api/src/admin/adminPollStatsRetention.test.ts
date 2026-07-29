import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin poll statistics retention", () => {
  it("uses PostgreSQL time and the parent-message retention predicate for lists and every aggregate", () => {
    const route = readFileSync(new URL("../routes/admin.ts", import.meta.url), "utf8");
    const stats = route.slice(route.indexOf('.get("/stats"'), route.indexOf('.get("/stats/users/:telegramId"'));
    expect(stats).toContain("clock_timestamp()");
    expect(stats).not.toContain("const now = new Date()");
    expect(stats).toContain("retainedPollParentCondition");
    expect(stats.match(/innerJoin\(clubChatMessages/g)).toHaveLength(3);
    expect(stats).toContain("where: retainedPollParentExists");
    expect(stats).toContain("projectAdminCommunityPollContent");
  });
});
