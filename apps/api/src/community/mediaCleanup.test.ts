import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(__dirname, "mediaCleanup.ts");
const source = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("community media cleanup job", () => {
  it("deletes S3 objects before marking attachments deleted and runs every ten minutes", () => {
    expect(source.indexOf("await deleteObject(attachment.objectKey)")).toBeGreaterThan(-1);
    expect(source.indexOf("await deleteObject(attachment.objectKey)")).toBeLessThan(source.indexOf("deletedAt: now"));
    expect(source).toContain("10 * 60 * 1000");
    expect(source).toContain("isNull(clubMessageAttachments.deletedAt)");
  });
});
