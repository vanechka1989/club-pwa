import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("session upload capability cleanup", () => {
  it("clears persisted community multipart recovery state on logout", () => {
    const source = readFileSync(resolve(__dirname, "session.ts"), "utf8");
    expect(source).toContain("clearCommunityUploadSessions");
    expect(source.indexOf("clearCommunityUploadSessions")).toBeLessThan(source.indexOf("user.value = null"));
  });

  it("clears persisted community drafts and text retries for the logged-out account", () => {
    const source = readFileSync(resolve(__dirname, "session.ts"), "utf8");
    expect(source).toContain("clearCommunityDraftsForUser");
    expect(source).toContain("clearCommunityOutboxForUser");
    expect(source).toContain("user.value?.id");
    expect(source.indexOf("clearCommunityDraftsForUser")).toBeLessThan(source.indexOf("user.value = null"));
    expect(source.indexOf("clearCommunityOutboxForUser")).toBeLessThan(source.indexOf("user.value = null"));
  });
});
