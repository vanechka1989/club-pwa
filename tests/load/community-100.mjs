import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSseParser, deliverySummary, evaluateThresholds, latencySummary, productionThresholds, resolveLoadProfile } from "./communityLoadTools.js";

const baseUrl = (process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const token = process.env.SESSION_COOKIE?.trim();
const topicId = process.env.TEST_TOPIC_ID?.trim();
const profileName = process.env.LOAD_PROFILE || "smoke";
const profile = resolveLoadProfile(profileName);
const production = /club2\.myn8nservertest\.ru/i.test(baseUrl);
const reportPath = resolve(process.env.REPORT_PATH || `tests/load/results/community-${Date.now()}.json`);
const headers = {
  Cookie: `club_session=${token}`,
  "X-Club-PWA-Standalone": "1",
  "Content-Type": "application/json",
  "User-Agent": "Club-PWA-realtime-capacity-test/2.0"
};
const clients = [];
const metricsSamples = [];
const errors = [];
let metricsTimer;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function requireConfiguration() {
  if (!token) throw new Error("SESSION_COOKIE is required");
  if (!topicId) throw new Error("TEST_TOPIC_ID is required");
  if (production && process.env.CONFIRM_PRODUCTION_LOAD !== "YES") {
    throw new Error("CONFIRM_PRODUCTION_LOAD=YES is required for production");
  }
}

async function fetchJson(path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path}: ${response.status} ${text.slice(0, 240)}`);
  return { body, durationMs: Math.round(performance.now() - startedAt), status: response.status };
}

class RealtimeClient {
  constructor(id) {
    this.id = id;
    this.controller = new AbortController();
    this.readyAt = null;
    this.targetEvents = [];
    this.foreignEvents = 0;
    this.duplicates = 0;
    this.eventIds = new Set();
    this.failure = null;
  }

  async connect() {
    const response = await fetch(`${baseUrl}/api/community/events?pwa=1`, {
      headers: { Cookie: headers.Cookie, "User-Agent": headers["User-Agent"] },
      signal: this.controller.signal
    });
    if (!response.ok || !response.body) throw new Error(`SSE client ${this.id}: HTTP ${response.status}`);
    const parser = createSseParser((event) => {
      const receivedAt = performance.now();
      if (event.event === "ready") this.readyAt = receivedAt;
      if (event.event !== "community.changed") return;
      try {
        const data = JSON.parse(event.data);
        if (data.topicId !== topicId) {
          this.foreignEvents += 1;
          return;
        }
        if (event.id && this.eventIds.has(event.id)) this.duplicates += 1;
        if (event.id) this.eventIds.add(event.id);
        this.targetEvents.push({ id: event.id, receivedAt });
      } catch (error) {
        this.failure = `invalid SSE JSON: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
    const decoder = new TextDecoder();
    this.readerTask = (async () => {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (!this.controller.signal.aborted) this.failure = error instanceof Error ? error.message : String(error);
      } finally {
        reader.releaseLock();
      }
    })();
  }

  close() {
    this.controller.abort();
  }
}

async function waitFor(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function sampleMetrics(stage) {
  const health = await fetchJson("/api/health");
  const ready = await fetchJson("/api/ready");
  const metrics = await fetchJson("/api/metrics");
  const sample = { stage, at: new Date().toISOString(), health: health.body, ready: ready.body, ...metrics.body };
  metricsSamples.push(sample);
  if (!sample.health?.ok || !sample.ready?.ok) throw new Error(`API unhealthy at ${stage}`);
  if ((sample.memoryRssBytes || 0) > 1_500_000_000) throw new Error(`API RSS safety limit exceeded at ${stage}`);
  return sample;
}

async function rampClients() {
  const stages = [];
  for (const target of profile.rampTargets) {
    const startedAt = performance.now();
    const newClients = Array.from({ length: target - clients.length }, (_, index) => new RealtimeClient(clients.length + index + 1));
    clients.push(...newClients);
    await Promise.all(newClients.map((client) => client.connect()));
    await waitFor(() => clients.every((client) => client.readyAt), `${target} ready clients`, 30_000);
    const metrics = await sampleMetrics(`ramp-${target}`);
    stages.push({ target, connected: clients.filter((client) => client.readyAt).length, serverSubscribers: metrics.realtimeSubscribers, durationMs: Math.round(performance.now() - startedAt) });
    if (metrics.realtimeSubscribers < target) throw new Error(`Server reports ${metrics.realtimeSubscribers} subscribers at target ${target}`);
    await sleep(profile.rampPauseMs);
  }
  return stages;
}

async function holdConnections() {
  if (!profile.holdMs) return { durationMs: 0, samples: 0, clientFailures: 0 };
  const startedAt = Date.now();
  let samples = 0;
  while (Date.now() - startedAt < profile.holdMs) {
    await sleep(Math.min(5_000, profile.holdMs - (Date.now() - startedAt)));
    const failures = clients.filter((client) => client.failure);
    if (failures.length) throw new Error(`${failures.length} SSE clients failed during sustained hold`);
    const metrics = await sampleMetrics(`hold-${samples + 1}`);
    if (metrics.realtimeSubscribers < profile.clients) {
      throw new Error(`Only ${metrics.realtimeSubscribers}/${profile.clients} subscribers remained during hold`);
    }
    samples += 1;
  }
  return { durationMs: Date.now() - startedAt, samples, clientFailures: 0 };
}

async function postMessage(label) {
  return fetchJson(`/api/community/topics/${encodeURIComponent(topicId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: `[LOAD-TEST] ${label} ${Date.now()}` })
  });
}

async function runSequentialDelivery() {
  const latencies = [];
  for (let index = 0; index < profile.sequentialMessages; index += 1) {
    const baselines = clients.map((client) => client.targetEvents.length);
    const startedAt = performance.now();
    await postMessage(`sequential-${index + 1}`);
    await waitFor(() => clients.every((client, clientIndex) => client.targetEvents.length >= baselines[clientIndex] + 1), `sequential event ${index + 1}`, 15_000);
    clients.forEach((client, clientIndex) => {
      latencies.push(Math.round(client.targetEvents[baselines[clientIndex]].receivedAt - startedAt));
    });
  }
  return latencySummary(latencies);
}

async function runBurstDelivery() {
  const baselines = clients.map((client) => client.targetEvents.length);
  const startedAt = performance.now();
  const responses = await Promise.all(Array.from({ length: profile.burstMessages }, (_, index) => postMessage(`burst-${index + 1}`)));
  await waitFor(
    () => clients.every((client, index) => client.targetEvents.length >= baselines[index] + profile.burstMessages),
    "burst delivery",
    30_000
  );
  const receivedByClient = clients.map((client, index) => client.targetEvents.length - baselines[index]);
  const completion = clients.map((client, index) => Math.round(client.targetEvents[baselines[index] + profile.burstMessages - 1].receivedAt - startedAt));
  return {
    postLatency: latencySummary(responses.map((response) => response.durationMs)),
    fanoutCompletion: latencySummary(completion),
    delivery: deliverySummary({
      expectedClients: clients.length,
      expectedEventsPerClient: profile.burstMessages,
      receivedByClient,
      duplicateCount: clients.reduce((sum, client) => sum + client.duplicates, 0)
    })
  };
}

async function runReconnect() {
  const count = Math.min(profile.reconnectClients, clients.length);
  const indexes = Array.from({ length: count }, (_, index) => index);
  indexes.forEach((index) => clients[index].close());
  await sleep(500);
  const startedAt = performance.now();
  await Promise.all(indexes.map(async (index) => {
    const replacement = new RealtimeClient(clients[index].id);
    clients[index] = replacement;
    await replacement.connect();
  }));
  await waitFor(() => indexes.every((index) => clients[index].readyAt), "reconnected clients", 30_000);
  const baselines = clients.map((client) => client.targetEvents.length);
  await postMessage("after-reconnect");
  await waitFor(() => clients.every((client, index) => client.targetEvents.length > baselines[index]), "post-reconnect event", 15_000);
  return { requested: count, restored: indexes.filter((index) => clients[index].readyAt).length, durationMs: Math.round(performance.now() - startedAt) };
}

async function runHttpLoad() {
  const paths = ["/api/me", "/api/notifications", "/api/support/unread", "/api/community/topics"];
  const durations = [];
  let failed = 0;
  for (let round = 0; round < profile.httpRounds; round += 1) {
    const results = await Promise.allSettled(Array.from({ length: profile.clients }, async () => {
      for (const path of paths) {
        const response = await fetchJson(path);
        durations.push(response.durationMs);
      }
    }));
    failed += results.filter((result) => result.status === "rejected").length;
    const attemptedClients = (round + 1) * profile.clients;
    if (failed / attemptedClients > 0.01) throw new Error(`HTTP client error rate exceeded 1% in round ${round + 1}`);
    await sampleMetrics(`http-round-${round + 1}`);
    await sleep(1_000);
  }
  return { requests: durations.length, failedClients: failed, latency: latencySummary(durations) };
}

async function cleanupTestMessages() {
  if (!token || !topicId) return { attempted: false };
  try {
    await fetchJson(`/api/community/topics/${encodeURIComponent(topicId)}/messages/delete-all`, { method: "POST", body: "{}" });
    return { attempted: true, ok: true };
  } catch (error) {
    return { attempted: true, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  requireConfiguration();
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl,
    profile: profileName,
    configuredClients: profile.clients,
    identityModel: "one temporary owner session, independent SSE connections",
    thresholds: productionThresholds,
    baseline: await sampleMetrics("baseline")
  };
  metricsTimer = setInterval(() => {
    sampleMetrics("periodic").catch((error) => errors.push(error instanceof Error ? error.message : String(error)));
  }, 2_000);

  let cleanup;
  try {
    report.ramp = await rampClients();
    report.hold = await holdConnections();
    report.sequential = await runSequentialDelivery();
    report.burst = await runBurstDelivery();
    report.reconnect = await runReconnect();
    report.http = await runHttpLoad();
    report.peak = await sampleMetrics("peak");
    report.clientFailures = clients.filter((client) => client.failure).map((client) => ({ id: client.id, error: client.failure }));
    report.foreignEvents = clients.reduce((sum, client) => sum + client.foreignEvents, 0);
    report.thresholdEvaluation = evaluateThresholds(report);
  } catch (error) {
    report.failure = error instanceof Error ? error.message : String(error);
    errors.push(report.failure);
  } finally {
    if (metricsTimer) clearInterval(metricsTimer);
    clients.forEach((client) => client.close());
    cleanup = await cleanupTestMessages();
    report.cleanup = cleanup;
    report.finishedAt = new Date().toISOString();
    report.metricsSamples = metricsSamples;
    report.errors = errors;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ reportPath, failure: report.failure || null, cleanup }, null, 2));
  }
  if (report.failure || cleanup?.ok === false) process.exitCode = 1;
  else if (report.thresholdEvaluation?.passed === false) process.exitCode = 2;
}

await main();
