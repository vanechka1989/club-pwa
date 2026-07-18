import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("S3 object privacy", () => {
  it("uses signed reads by default and permits public URLs only explicitly", () => {
    const source = readFileSync(new URL("./s3.ts", import.meta.url), "utf8");
    expect(source).toContain("allowPublic && config.publicBaseUrl");
    expect(source).toContain("allowPublic?: boolean");
    expect(source).toContain("url: null");
  });
});
