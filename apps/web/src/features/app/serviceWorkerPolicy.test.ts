import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("service worker cache policy", () => {
  it("never caches API or failed/cross-origin asset responses", () => {
    const source = readFileSync(resolve(__dirname, "../../../public/sw.js"), "utf8");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('url.pathname.startsWith("/assets/")');
    expect(source).toContain("url.origin === self.location.origin");
    expect(source).toContain("response.ok");
  });
});
