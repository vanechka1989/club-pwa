import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("long-list image loading", () => {
  it("defers admin list avatars until they approach the viewport", () => {
    const source = readFileSync(resolve(__dirname, "../admin/AdminSection.vue"), "utf8");
    expect(source.match(/loading="lazy" decoding="async"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("decodes chat avatars asynchronously", () => {
    const source = readFileSync(resolve(__dirname, "../community/CommunitySection.vue"), "utf8");
    expect(source.match(/loading="lazy"\s+decoding="async"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
