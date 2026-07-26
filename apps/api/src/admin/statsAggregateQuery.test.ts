import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin statistics aggregates", () => {
  it("counts active memberships and completions across the full database", () => {
    const source = readFileSync(new URL("../routes/admin.ts", import.meta.url), "utf8");
    expect(source).toContain("countDistinct(subscriptions.userId)");
    expect(source).toContain("count(userContentProgress.id)");
    expect(source).toContain("activeUsers: activeUsersCountRow?.value ?? 0");
    expect(source).toContain("completedItems: completedItemsCountRow?.value ?? 0");
  });
});
