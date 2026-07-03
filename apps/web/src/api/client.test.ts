import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("api client", () => {
  it("uses a relative api path by default so the web image works on any client domain", () => {
    const source = readFileSync(resolve(process.cwd(), "src/api/client.ts"), "utf8");

    expect(source).toContain('import.meta.env.VITE_API_URL ?? "/api"');
  });
});
