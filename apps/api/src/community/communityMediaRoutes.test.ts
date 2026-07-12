import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");

describe("community media routes", () => {
  it("accepts voice and image multipart messages with existing access checks", () => {
    expect(route).toContain('.post("/topics/:id/messages/voice"');
    expect(route).toContain('.post("/topics/:id/messages/images"');
    expect(route).toContain("getCommunityMediaExpiry(role");
    expect(route).toContain("validateCommunityImageFiles(files)");
    expect(route).toContain("durationSeconds > 300");
    expect(route).toContain("await deleteObject(key)");
  });
});
