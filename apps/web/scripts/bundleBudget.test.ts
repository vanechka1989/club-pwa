import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertBundleBudget,
  assertEntryCssExcludes,
  assertEntryJavaScriptExcludes,
  measureEntryAssets
} from "./bundleBudget.mjs";

const temporaryDirectories: string[] = [];

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "club-bundle-budget-"));
  const assets = join(directory, "assets");
  temporaryDirectories.push(directory);
  mkdirSync(assets);
  writeFileSync(
    join(directory, "index.html"),
    '<link rel="stylesheet" href="/assets/main.css"><link rel="modulepreload" href="/assets/lazy.js"><script type="module" src="/assets/main.js"></script>'
  );
  writeFileSync(join(assets, "main.js"), "console.log('startup')");
  writeFileSync(join(assets, "main.css"), "body{color:red}");
  writeFileSync(join(assets, "lazy.js"), "this lazy chunk must not count toward the entry budget");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("production bundle budget", () => {
  it("measures only executable entry scripts and render-blocking styles", () => {
    const metrics = measureEntryAssets(createFixture());

    expect(metrics).toEqual({
      javascript: { files: ["assets/main.js"], rawBytes: 22, gzipBytes: 42 },
      css: { files: ["assets/main.css"], rawBytes: 15, gzipBytes: 35 },
      totalGzipBytes: 77
    });
  });

  it("rejects an entry payload that exceeds any configured limit", () => {
    const metrics = measureEntryAssets(createFixture());

    expect(() =>
      assertBundleBudget(metrics, {
        javascriptGzipBytes: 41,
        cssGzipBytes: 35,
        totalGzipBytes: 77
      })
    ).toThrow("entry JavaScript is 42 gzip bytes; budget is 41");
  });

  it("rejects lazy-only endpoint code in executable entry scripts", () => {
    const directory = createFixture();
    writeFileSync(join(directory, "assets", "main.js"), 'fetch("/admin/server-status")');

    expect(() => assertEntryJavaScriptExcludes(directory, ["/admin/server-status"])).toThrow(
      'entry JavaScript contains lazy-only code: "/admin/server-status"'
    );
  });

  it("rejects a lazy route stylesheet linked by the production entry", () => {
    const directory = createFixture();
    writeFileSync(
      join(directory, "index.html"),
      '<link rel="stylesheet" href="/assets/main.css"><link rel="stylesheet" href="/assets/ProfileSection-test.css"><script type="module" src="/assets/main.js"></script>'
    );
    writeFileSync(join(directory, "assets", "ProfileSection-test.css"), ".profile-card{display:block}");

    expect(() => assertEntryCssExcludes(directory, ["ProfileSection-"])).toThrow(
      'entry CSS contains lazy-only stylesheet: "assets/ProfileSection-test.css"'
    );
  });
});
