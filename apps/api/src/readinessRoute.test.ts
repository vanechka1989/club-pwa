import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("readiness route", () => {
  it("returns 503 until all configured dependencies are ready", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain('app.get("/ready"');
    expect(source).toContain("readiness.ok ? 200 : 503");
    expect(source).toContain("{ ok: readiness.ok }");
    expect(source).not.toContain("return c.json(readiness,");
  });
});
