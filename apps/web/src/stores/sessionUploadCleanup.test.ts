import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("session upload capability cleanup", () => {
  it("clears persisted community multipart recovery state on logout", () => {
    const source = readFileSync(resolve(__dirname, "session.ts"), "utf8");
    const logout = source.slice(source.indexOf("async function logout"));
    expect(logout).toContain("clearCommunityUploadSessions");
    expect(logout.indexOf("user.value = null")).toBeLessThan(logout.indexOf("await Promise.all"));
    expect(logout).toContain('localStorage.removeItem("club-community-multipart-sessions")');
  });

  it("clears persisted community drafts and text retries for the logged-out account", () => {
    const source = readFileSync(resolve(__dirname, "session.ts"), "utf8");
    const logout = source.slice(source.indexOf("async function logout"));
    expect(logout).toContain("clearCommunityDraftsForUser");
    expect(logout).toContain("clearCommunityOutboxForUser");
    expect(logout).toContain("clearCommunityUploadDraftsForUser");
    expect(logout).toContain("user.value?.id");
    expect(logout.indexOf("clearCommunityDraftsForUser")).toBeLessThan(logout.indexOf("user.value = null"));
    expect(logout.indexOf("clearCommunityOutboxForUser")).toBeLessThan(logout.indexOf("user.value = null"));
    expect(logout).toContain('localStorage.removeItem("club-community-upload-drafts-v1")');
  });
});
