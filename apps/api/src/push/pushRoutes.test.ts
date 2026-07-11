import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push subscription routes", () => {
  it("revokes an endpoint only for the authenticated user", () => {
    const source = readFileSync(resolve(__dirname, "../routes/push.ts"), "utf8");
    expect(source).toContain("and(");
    expect(source).toContain("eq(pushSubscriptions.endpoint, subscription.endpoint)");
    expect(source).toContain('eq(pushSubscriptions.userId, c.get("userId"))');
  });
});
