import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("support ticket list bounds", () => {
  it("bounds ticket and embedded message collections", () => {
    const source = readFileSync(new URL("../routes/support.ts", import.meta.url), "utf8");
    expect(source.match(/limit: 100/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/limit: 200/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
