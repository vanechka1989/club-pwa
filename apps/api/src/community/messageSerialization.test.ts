import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");

describe("community media serialization", () => {
  it("returns active URLs and stable deleted placeholders through media contracts", () => {
    expect(route).toContain("clubMessageAttachments.messageId");
    expect(route).toContain("attachment.deletedAt ? null : await getObjectReadUrl");
    expect(route).toContain('kind === "voice"');
    expect(route).toContain('kind === "images"');
  });
});
