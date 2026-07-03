import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("boot diagnostics", () => {
  const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const diagnosticsScript = readFileSync(resolve(process.cwd(), "public/boot-diagnostics.js"), "utf8");

  it("installs startup error reporting before the app module loads", () => {
    expect(indexHtml).toContain('<script src="/boot-diagnostics.js"></script>');
    expect(indexHtml.indexOf("/boot-diagnostics.js")).toBeLessThan(indexHtml.indexOf("/src/main.ts"));
    expect(diagnosticsScript).toContain("/api/client-errors");
    expect(diagnosticsScript).toContain('window.addEventListener("error"');
    expect(diagnosticsScript).toContain('window.addEventListener("unhandledrejection"');
  });

  it("shows a human readable fallback instead of a blank screen when Vue does not mount", () => {
    expect(diagnosticsScript).toContain("club-boot-fallback");
    expect(diagnosticsScript).toContain("Не удалось открыть клуб");
    expect(diagnosticsScript).toContain("window.location.reload()");
  });
});
