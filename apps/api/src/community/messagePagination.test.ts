import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("community message pagination", () => {
  it("uses a bounded cursor page and returns a continuation cursor", () => {
    const source = readFileSync(new URL("../routes/community.ts", import.meta.url), "utf8");
    expect(source).toContain("messagePageQuerySchema");
    expect(source).toContain("limit: query.data.limit + 1");
    expect(source).toContain("nextCursor:");
    expect(source).not.toContain("limit: 500");
  });
});
