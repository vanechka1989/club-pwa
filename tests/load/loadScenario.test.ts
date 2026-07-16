import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("150 user load scenario", () => {
  it("ramps through 50 and 100 before reaching 150 virtual users", () => {
    const source = readFileSync(resolve(process.cwd(), "tests/load/club-150.js"), "utf8");
    expect(source).toContain("target: 50");
    expect(source).toContain("target: 100");
    expect(source).toContain("target: 150");
  });

  it("enforces the agreed latency and error thresholds", () => {
    const source = readFileSync(resolve(process.cwd(), "tests/load/club-150.js"), "utf8");
    expect(source).toContain("http_req_failed: ['rate<0.005']");
    expect(source).toContain("http_req_duration: ['p(95)<500', 'p(99)<1500']");
  });
});
