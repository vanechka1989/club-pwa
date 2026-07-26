import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

function entryPaths(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1].replace(/^\//, ""));
}

function measureFiles(distDirectory, files) {
  if (!files.length) throw new Error("production entry asset group is empty");
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const assetPath = resolve(distDirectory, file);
    const distRoot = `${resolve(distDirectory)}${sep}`;
    if (!assetPath.startsWith(distRoot) || !existsSync(assetPath)) {
      throw new Error(`production entry asset is missing: ${file}`);
    }
    const content = readFileSync(assetPath);
    rawBytes += content.byteLength;
    gzipBytes += gzipSync(content).byteLength;
  }
  return { files, rawBytes, gzipBytes };
}

export function measureEntryAssets(distDirectory) {
  const htmlPath = resolve(distDirectory, "index.html");
  if (!existsSync(htmlPath)) throw new Error(`production index is missing: ${htmlPath}`);
  const html = readFileSync(htmlPath, "utf8");
  const javascript = measureFiles(
    distDirectory,
    entryPaths(html, /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)
  );
  const css = measureFiles(
    distDirectory,
    entryPaths(html, /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)
  );
  return { javascript, css, totalGzipBytes: javascript.gzipBytes + css.gzipBytes };
}

export function assertBundleBudget(metrics, limits) {
  const failures = [];
  if (metrics.javascript.gzipBytes > limits.javascriptGzipBytes) {
    failures.push(`entry JavaScript is ${metrics.javascript.gzipBytes} gzip bytes; budget is ${limits.javascriptGzipBytes}`);
  }
  if (metrics.css.gzipBytes > limits.cssGzipBytes) {
    failures.push(`entry CSS is ${metrics.css.gzipBytes} gzip bytes; budget is ${limits.cssGzipBytes}`);
  }
  if (metrics.totalGzipBytes > limits.totalGzipBytes) {
    failures.push(`combined entry payload is ${metrics.totalGzipBytes} gzip bytes; budget is ${limits.totalGzipBytes}`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return metrics;
}

export function assertEntryJavaScriptExcludes(distDirectory, forbiddenSubstrings) {
  const html = readFileSync(resolve(distDirectory, "index.html"), "utf8");
  const files = entryPaths(html, /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
  for (const file of files) {
    const content = readFileSync(resolve(distDirectory, file), "utf8");
    const forbidden = forbiddenSubstrings.find((value) => content.includes(value));
    if (forbidden) throw new Error(`entry JavaScript contains lazy-only code: "${forbidden}"`);
  }
}

export function assertEntryCssExcludes(distDirectory, forbiddenAssetPrefixes) {
  const html = readFileSync(resolve(distDirectory, "index.html"), "utf8");
  const files = entryPaths(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  );
  for (const file of files) {
    if (forbiddenAssetPrefixes.some((prefix) => file.includes(prefix))) {
      throw new Error(`entry CSS contains lazy-only stylesheet: "${file}"`);
    }
  }
}

function formatMetrics(metrics) {
  return [
    `Entry JavaScript: ${metrics.javascript.rawBytes} raw / ${metrics.javascript.gzipBytes} gzip bytes`,
    `Entry CSS: ${metrics.css.rawBytes} raw / ${metrics.css.gzipBytes} gzip bytes`,
    `Combined entry gzip: ${metrics.totalGzipBytes} bytes`
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const metrics = measureEntryAssets(resolve(scriptDirectory, "../dist"));
  console.log(formatMetrics(metrics));
  assertBundleBudget(metrics, {
    javascriptGzipBytes: 105_000,
    cssGzipBytes: 55_000,
    totalGzipBytes: 155_000
  });
  assertEntryJavaScriptExcludes(resolve(scriptDirectory, "../dist"), ["/admin/server-status"]);
  assertEntryCssExcludes(resolve(scriptDirectory, "../dist"), [
    "ProfileSection-",
    "LearningSection-",
    "SupportSection-",
    "PaymentsSection-",
    "AdminSection-",
    "NotificationCenterScreen-",
    "CommunitySection-"
  ]);
}
