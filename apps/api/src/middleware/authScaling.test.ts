import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");

describe("session auth scaling", () => {
  it("updates session activity conditionally instead of on every request", () => {
    expect(source).toContain("shouldRefreshSessionActivity(session.lastSeenAt)");
    expect(source).toContain("lt(authSessions.lastSeenAt, activityRefreshBefore)");
  });

  it("queries owner settings only when preview was requested", () => {
    expect(source).toContain("const previewRequested = previewMode.success || previewMembershipStatus !== undefined");
    expect(source).toContain("const isOwner = previewRequested ? await isOwnerTelegramId(sessionUser.id) : false");
  });
});
