import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HTTP server upload tolerance", () => {
  it("keeps slow mobile request bodies alive long enough to finish", () => {
    const source = readFileSync(resolve(__dirname, "index.ts"), "utf-8");

    expect(source).toContain("idleTimeout: 120");
  });
});
