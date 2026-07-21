import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email acquisition wiring", () => {
  it("accepts the visitor id and attaches attribution without blocking auth", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/auth.ts"), "utf8");
    expect(route).toMatch(/acquisitionVisitorId:\s*z\.string\(\)\.uuid\(\).*optional/);
    expect(route).toContain("attachAcquisitionToUser");
    expect(route).toMatch(/attachAcquisitionToUser[\s\S]*\.catch\(\(\) => null\)/);
  });
});
