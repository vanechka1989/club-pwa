import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S3 production load runner safeguards", () => {
  it("keeps the production guard, multipart path, monitoring, verification, and cleanup", async () => {
    const source = await readFile(resolve("tests/load/s3-100.mjs"), "utf8");

    expect(source).toContain("CONFIRM_PRODUCTION_LOAD");
    expect(source).toContain("/api/admin/learning/materials/uploads/multipart");
    expect(source).toContain("part.uploadUrl");
    expect(source).toContain("/api/admin/learning/materials/uploads/multipart/complete");
    expect(source).toContain("/api/health");
    expect(source).toContain("/api/ready");
    expect(source).toContain("/api/metrics");
    expect(source).toContain("/api/admin/storage/s3/objects");
    expect(source).toContain("/api/admin/storage/s3/objects/url");
    expect(source).toContain('Range: "bytes=0-0"');
    expect(source).toContain("sameApplicationOrigin");
    expect(source).toContain("sameApplicationOrigin ? commonHeaders : {}");
    expect(source).toContain("verifyUploadedObject");
    expect(source).toContain("buildVerificationRetryDelays");
    expect(source).toContain("cleanupCompletedObjects");
    expect(source).toMatch(/finally\s*\{/);
    expect(source).not.toContain("learning/materials/direct");
  });
});
