import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const sessionCookie = process.env.SESSION_COOKIE?.trim();
const clients = Number(process.env.LOAD_CLIENTS || 100);
const rounds = Number(process.env.LOAD_ROUNDS || 3);
const paths = (process.env.LOAD_PATHS || "/api/app-state,/api/community/topics")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const reportPath = resolve(process.env.LOAD_REPORT || "tests/load/results/api-profile-100.json");

function requireConfiguration() {
  if (!sessionCookie) throw new Error("SESSION_COOKIE is required");
  if (!Number.isInteger(clients) || clients < 1 || clients > 500) throw new Error("LOAD_CLIENTS must be between 1 and 500");
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) throw new Error("LOAD_ROUNDS must be between 1 and 20");
  if (!paths.length) throw new Error("LOAD_PATHS must contain at least one API path");
  if (/club2\.myn8nservertest\.ru/i.test(baseUrl) && process.env.CONFIRM_PRODUCTION_LOAD !== "YES") {
    throw new Error("Production load requires CONFIRM_PRODUCTION_LOAD=YES");
  }
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]);
}

function latencySummary(values) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length ? Math.round(Math.max(...values)) : null
  };
}

function validatePayload(path, payload) {
  if (path === "/api/app-state") {
    if (!payload || typeof payload !== "object" || typeof payload.notificationUnreadCount !== "number") {
      throw new Error("Invalid app-state payload");
    }
    return;
  }
  if (path === "/api/community/topics" && !Array.isArray(payload)) {
    throw new Error("Invalid community topics payload");
  }
}

async function request(path) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      cookie: `club_session=${sessionCookie}`,
      accept: "application/json",
      "X-Club-PWA-Standalone": "1"
    },
    redirect: "error"
  });
  const elapsedMs = performance.now() - startedAt;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  validatePayload(path, payload);
  return elapsedMs;
}

async function probe(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { accept: "application/json" } });
  return { path, status: response.status, ok: response.ok };
}

async function main() {
  requireConfiguration();
  const startedAt = new Date().toISOString();
  const durations = [];
  const durationsByPath = Object.fromEntries(paths.map((path) => [path, []]));
  const failures = [];
  const waves = [];
  const healthBefore = await Promise.all([probe("/api/health"), probe("/api/ready")]);

  for (let round = 1; round <= rounds; round += 1) {
    const waveStartedAt = performance.now();
    const results = await Promise.allSettled(Array.from({ length: clients }, async (_, clientIndex) => {
      for (const path of paths) {
        try {
          const elapsedMs = await request(path);
          durations.push(elapsedMs);
          durationsByPath[path].push(elapsedMs);
        } catch (error) {
          failures.push({ round, clientIndex, path, error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
    }));
    waves.push({
      round,
      durationMs: Math.round(performance.now() - waveStartedAt),
      successfulClients: results.filter((result) => result.status === "fulfilled").length,
      failedClients: results.filter((result) => result.status === "rejected").length
    });
    if (failures.length / (round * clients) > 0.01) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  const healthAfter = await Promise.all([probe("/api/health"), probe("/api/ready")]);
  const expectedRequests = clients * rounds * paths.length;
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl,
    clients,
    rounds,
    paths,
    identityModel: "one temporary owner session, 100 independent HTTP flows",
    expectedRequests,
    successfulRequests: durations.length,
    failedRequests: failures.length,
    errorRate: expectedRequests ? failures.length / expectedRequests : 0,
    latency: latencySummary(durations),
    latencyByPath: Object.fromEntries(Object.entries(durationsByPath).map(([path, values]) => [path, latencySummary(values)])),
    waves,
    healthBefore,
    healthAfter,
    failures: failures.slice(0, 20),
    passed: failures.length === 0 && healthBefore.every((item) => item.ok) && healthAfter.every((item) => item.ok)
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, passed: report.passed, requests: report.successfulRequests, latency: report.latency }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
