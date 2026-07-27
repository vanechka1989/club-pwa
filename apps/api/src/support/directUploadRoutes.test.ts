import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = readFileSync(resolve(__dirname, "../routes/support.ts"), "utf8");

describe("support streaming routes", () => {
  it("streams bounded upload bodies and never parses support multipart forms", () => {
    expect(routes).toContain('.put("/uploads/:uploadToken"');
    expect(routes).toContain("Readable.fromWeb(c.req.raw.body");
    expect(routes).toContain("uploadObjectStream({");
    expect(routes).not.toContain("c.req.formData()");
    expect(routes).not.toContain("c.req.arrayBuffer()");
  });
});
