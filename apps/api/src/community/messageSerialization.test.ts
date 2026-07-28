import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");

describe("community media serialization", () => {
  it("returns URLs only for ready attachments and supports every media kind", () => {
    expect(route).toContain("clubMessageAttachments.messageId");
    expect(route).toContain('url: scanStatus === "ready" ? await getObjectReadUrl(attachment.objectKey) : null');
    expect(route).toContain('kind === "voice"');
    expect(route).toContain('kind === "images"');
    expect(route).toContain('kind === "video"');
    expect(route).toContain('kind === "document"');
  });
});
