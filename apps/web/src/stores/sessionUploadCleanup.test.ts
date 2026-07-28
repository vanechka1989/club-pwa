import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("session upload capability cleanup", () => {
  it("clears persisted community multipart recovery state on logout", () => {
    const source = readFileSync(resolve(__dirname, "session.ts"), "utf8");
    expect(source).toContain("clearCommunityUploadSessions");
    expect(source.indexOf("clearCommunityUploadSessions")).toBeLessThan(source.indexOf("user.value = null"));
  });
});
