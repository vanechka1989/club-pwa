import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function productionSources(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return productionSources(path);
    if (path.endsWith(".test.ts")) return [];
    return [".ts", ".vue"].includes(extname(path)) ? [path] : [];
  });
}

describe("native browser dialogs", () => {
  it("keeps browser confirm, alert, and prompt out of the production interface", () => {
    const src = resolve(__dirname, "../..");
    const offenders = productionSources(src).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /(?:window|globalThis)\.(?:confirm|alert|prompt)\b/.test(source) ? [path.replace(src, "")] : [];
    });

    expect(offenders).toEqual([]);
  });
});
