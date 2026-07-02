import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("boot diagnostics", () => {
  const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("installs startup error reporting before the app module loads", () => {
    expect(indexHtml).toContain("/api/client-errors");
    expect(indexHtml).toContain('window.addEventListener("error"');
    expect(indexHtml).toContain('window.addEventListener("unhandledrejection"');
    expect(indexHtml.indexOf("/api/client-errors")).toBeLessThan(indexHtml.indexOf("/src/main.ts"));
  });

  it("shows a human readable fallback instead of a blank screen when Vue does not mount", () => {
    expect(indexHtml).toContain("club-boot-fallback");
    expect(indexHtml).toContain("Не удалось открыть клуб");
    expect(indexHtml).toContain("location.reload()");
  });
});
