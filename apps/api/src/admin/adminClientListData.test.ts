import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

describe("admin client list data", () => {
  it("returns the account email, stored avatar URL and real session activity", () => {
    expect(source).toContain("email: user.email");
    expect(source).toContain("user.avatarObjectKey");
    expect(source).toContain("getObjectReadUrl(user.avatarObjectKey)");
    expect(source).toContain("db.query.authSessions.findFirst");
    expect(source).toContain("latestSession?.lastSeenAt");
  });
});
