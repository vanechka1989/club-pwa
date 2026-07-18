import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildRampBatches,
  buildVerificationRetryDelays,
  evaluateS3Thresholds,
  latencySummary,
  makeDeterministicPayload,
  resolveS3LoadProfile
} from "./s3LoadTools.js";

const MiB = 1024 * 1024;
const baseUrl = (process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const sessionCookie = process.env.SESSION_COOKIE?.trim();
const profileName = process.env.LOAD_PROFILE || "smoke";
const profile = resolveS3LoadProfile(profileName);
const production = /club2\.myn8nservertest\.ru/i.test(baseUrl);
const runId = process.env.LOAD_RUN_ID || `s3-load-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const reportPath = resolve(process.env.REPORT_PATH || `tests/load/results/${runId}.json`);
const commonHeaders = {
  Cookie: `club_session=${sessionCookie}`,
  "X-Club-PWA-Standalone": "1",
  "User-Agent": "Club-PWA-S3-capacity-test/1.0"
};
const operations = [];
const metricsSamples = [];
const initializedUploads = [];
const completedObjectKeys = new Set();
const errors = [];
const safetyController = new AbortController();
let metricsTimer;
let safetyFailure = null;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function requireConfiguration() {
  if (!sessionCookie) throw new Error("SESSION_COOKIE is required");
  if (production && process.env.CONFIRM_PRODUCTION_LOAD !== "YES") {
    throw new Error("CONFIRM_PRODUCTION_LOAD=YES is required for production");
  }
}

function safeError(error) {
  return error instanceof Error ? error.message.replace(/uploadId=[^&\s]+/g, "uploadId=[redacted]") : String(error);
}

async function request(path, {
  operation = "request",
  method = "GET",
  body,
  json,
  headers,
  parseJson = true,
  timeoutMs = 30_000,
  track = true,
  ignoreSafety = false
} = {}) {
  const startedAt = performance.now();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const sameApplicationOrigin = new URL(url).origin === new URL(baseUrl).origin;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  const signal = ignoreSafety ? controller.signal : AbortSignal.any([controller.signal, safetyController.signal]);
  let status = 0;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(sameApplicationOrigin ? commonHeaders : {}),
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
        ...(body === undefined ? {} : { "Content-Type": "application/octet-stream" }),
        ...headers
      },
      body: json === undefined ? body : JSON.stringify(json),
      signal
    });
    status = response.status;
    const text = await response.text();
    const parsed = parseJson && text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${operation}: HTTP ${response.status} ${text.slice(0, 240)}`);
    if (track) {
      operations.push({ operation, status, ok: true, durationMs: Math.round(performance.now() - startedAt), bytes: body?.byteLength || 0 });
    }
    return { body: parsed, response };
  } catch (error) {
    if (track) {
      operations.push({ operation, status, ok: false, durationMs: Math.round(performance.now() - startedAt), bytes: body?.byteLength || 0, error: safeError(error) });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sampleMetrics(stage) {
  try {
    const [health, ready, metrics] = await Promise.all([
      request("/api/health", { operation: "health", track: false }),
      request("/api/ready", { operation: "ready", track: false }),
      request("/api/metrics", { operation: "metrics", track: false })
    ]);
    const sample = { stage, at: new Date().toISOString(), health: health.body, ready: ready.body, ...metrics.body };
    metricsSamples.push(sample);
    if (!sample.health?.ok || !sample.ready?.ok) throw new Error(`API is not healthy at ${stage}`);
    if ((sample.memoryRssBytes || 0) > profile.apiRssLimitBytes) {
      throw new Error(`API RSS ${sample.memoryRssBytes} exceeded ${profile.apiRssLimitBytes} at ${stage}`);
    }
    return sample;
  } catch (error) {
    if (!safetyFailure) safetyFailure = safeError(error);
    safetyController.abort(error);
    throw error;
  }
}

function buildUploadDefinition(kind, index, sizeBytes) {
  const isVideo = kind === "video";
  return {
    purpose: "media",
    kind,
    fileName: `${runId}-${kind}-${String(index).padStart(3, "0")}.${isVideo ? "mp4" : "webp"}`,
    contentType: isVideo ? "video/mp4" : "image/webp",
    sizeBytes
  };
}

async function initializeUpload(definition, clientId) {
  const { body } = await request("/api/admin/learning/materials/uploads/multipart", {
    operation: "multipart-init",
    method: "POST",
    json: definition
  });
  const state = { clientId, definition, ...body, uploadedParts: [], completed: false, verified: false };
  initializedUploads.push(state);
  return state;
}

async function uploadPartWithRetry(state, part, bytes) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { response } = await request(part.uploadUrl, {
        operation: "multipart-part",
        method: "PUT",
        body: bytes,
        timeoutMs: 180_000
      });
      const etag = response.headers.get("etag");
      if (!etag) throw new Error(`multipart-part ${part.partNumber} returned no ETag`);
      state.uploadedParts.push({ partNumber: part.partNumber, etag });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3 && !safetyController.signal.aborted) await sleep(500 * attempt);
    }
  }
  throw lastError;
}

async function completeUpload(state, { ignoreSafety = false } = {}) {
  const { body } = await request("/api/admin/learning/materials/uploads/multipart/complete", {
    operation: "multipart-complete",
    method: "POST",
    json: {
      objectKey: state.objectKey,
      uploadId: state.uploadId,
      contentType: state.contentType,
      sizeBytes: state.sizeBytes,
      parts: [...state.uploadedParts].sort((a, b) => a.partNumber - b.partNumber)
    },
    timeoutMs: 60_000,
    ignoreSafety
  });
  state.completed = true;
  completedObjectKeys.add(body.objectKey);
}

async function uploadPreparedObject(state, payload) {
  for (const part of state.parts) {
    const start = (part.partNumber - 1) * state.partSizeBytes;
    const end = Math.min(start + state.partSizeBytes, state.sizeBytes);
    await uploadPartWithRetry(state, part, payload.subarray(start, end));
  }
  await completeUpload(state);
}

async function verifyUploadedObject(state) {
  let lastObservedSize = null;
  let lastError = null;
  for (const delayMs of buildVerificationRetryDelays()) {
    if (delayMs) await sleep(delayMs);
    try {
      const { body } = await request("/api/admin/storage/s3/objects/url", {
        operation: "s3-verify-url",
        method: "POST",
        json: { key: state.objectKey, target: "primary" }
      });
      const { response } = await request(body.url, {
        operation: "s3-verify-range",
        headers: { Range: "bytes=0-0" },
        parseJson: false
      });
      const contentRange = response.headers.get("content-range");
      lastObservedSize = Number(contentRange?.match(/\/(\d+)$/)?.[1] ?? response.headers.get("content-length"));
      if (lastObservedSize === state.sizeBytes) {
        state.verified = true;
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (Number.isFinite(lastObservedSize)) {
    throw new Error(`S3 size mismatch for ${state.objectKey}: ${lastObservedSize}/${state.sizeBytes}`);
  }
  throw new Error(`S3 object is not readable after completion: ${state.objectKey}${lastError ? ` (${safeError(lastError)})` : ""}`);
}

async function initializePhase({ kind, clients, sizeBytes, rampTargets }) {
  const states = [];
  const targets = rampTargets || [clients];
  const batches = buildRampBatches(targets);
  let created = 0;
  for (let stage = 0; stage < batches.length; stage += 1) {
    const batchSize = batches[stage];
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, offset) => {
        const index = created + offset + 1;
        return initializeUpload(buildUploadDefinition(kind, index, sizeBytes), `${kind}-${index}`);
      })
    );
    states.push(...batch);
    created += batchSize;
    await sampleMetrics(`${kind}-initialized-${targets[stage]}`);
    if (stage < batches.length - 1) await sleep(profile.stagePauseMs);
  }
  return states;
}

async function verifyInBatches(states, batchSize = 20) {
  for (let index = 0; index < states.length; index += batchSize) {
    await Promise.all(states.slice(index, index + batchSize).map(verifyUploadedObject));
  }
}

async function runPhase({ kind, clients, sizeBytes, rampTargets }) {
  const startedAt = performance.now();
  const states = await initializePhase({ kind, clients, sizeBytes, rampTargets });
  const payload = makeDeterministicPayload(sizeBytes, kind === "video" ? 29 : 17);
  const transferStartedAt = performance.now();
  const results = await Promise.allSettled(states.map((state) => uploadPreparedObject(state, payload)));
  const failures = results
    .map((result, index) => result.status === "rejected" ? { clientId: states[index].clientId, error: safeError(result.reason) } : null)
    .filter(Boolean);
  if (failures.length) throw new Error(`${kind} phase failed for ${failures.length}/${clients} clients: ${failures[0].error}`);
  await verifyInBatches(states);
  const peak = await sampleMetrics(`${kind}-completed`);
  const transferDurationMs = Math.round(performance.now() - transferStartedAt);
  return {
    kind,
    clients,
    sizeBytes,
    totalBytes: clients * sizeBytes,
    durationMs: Math.round(performance.now() - startedAt),
    transferDurationMs,
    throughputMiBPerSecond: Number(((clients * sizeBytes) / MiB / (transferDurationMs / 1000)).toFixed(2)),
    completed: states.filter((state) => state.completed).length,
    verified: states.filter((state) => state.verified).length,
    failures,
    peakApiRssBytes: peak.memoryRssBytes || 0
  };
}

async function cleanupCompletedObjects() {
  const cleanupErrors = [];
  for (const key of [...completedObjectKeys]) {
    try {
      await request("/api/admin/storage/s3/objects", {
        operation: "s3-delete",
        method: "DELETE",
        json: { key, target: "primary" },
        timeoutMs: 60_000,
        ignoreSafety: true
      });
      completedObjectKeys.delete(key);
    } catch (error) {
      cleanupErrors.push(safeError(error));
    }
  }
  return cleanupErrors;
}

async function settleIncompleteUploads() {
  const errorsDuringCleanup = [];
  for (const state of initializedUploads.filter((upload) => !upload.completed && upload.uploadedParts.length > 0)) {
    try {
      await completeUpload(state, { ignoreSafety: true });
    } catch {
      // The API aborts the S3 multipart session when completion is rejected.
    }
  }
  for (const state of initializedUploads.filter((upload) => !upload.completed && upload.uploadedParts.length === 0)) {
    errorsDuringCleanup.push(`Multipart session requires server-side abort: ${state.objectKey}`);
  }
  return errorsDuringCleanup;
}

function summarizeOperations() {
  const byType = {};
  for (const operation of operations) {
    const summary = byType[operation.operation] ||= { requests: 0, failures: 0, bytes: 0, durations: [] };
    summary.requests += 1;
    summary.failures += operation.ok ? 0 : 1;
    summary.bytes += operation.bytes || 0;
    summary.durations.push(operation.durationMs);
  }
  return Object.fromEntries(Object.entries(byType).map(([name, value]) => [name, {
    requests: value.requests,
    failures: value.failures,
    bytes: value.bytes,
    latency: latencySummary(value.durations)
  }]));
}

async function main() {
  requireConfiguration();
  const report = {
    runId,
    startedAt: new Date().toISOString(),
    baseUrl,
    profile: profileName,
    identityModel: "one temporary owner session, independent multipart upload flows",
    phases: [],
    baseline: await sampleMetrics("baseline")
  };

  metricsTimer = setInterval(() => {
    sampleMetrics("periodic").catch((error) => errors.push(safeError(error)));
  }, 1_000);

  try {
    report.phases.push(await runPhase({
      kind: "photo",
      clients: profile.imageClients,
      sizeBytes: profile.imageSizeBytes,
      rampTargets: profile.imageRampTargets
    }));
    const imageCleanupErrors = await cleanupCompletedObjects();
    if (imageCleanupErrors.length) throw new Error(`Image cleanup failed: ${imageCleanupErrors[0]}`);
    report.phases.push(await runPhase({
      kind: "video",
      clients: profile.videoClients,
      sizeBytes: profile.videoSizeBytes,
      rampTargets: [profile.videoClients]
    }));
    report.peak = await sampleMetrics("peak");
  } catch (error) {
    report.failure = safeError(error);
    errors.push(report.failure);
  } finally {
    if (metricsTimer) clearInterval(metricsTimer);
    const incompleteErrors = await settleIncompleteUploads();
    const deleteErrors = await cleanupCompletedObjects();
    const completedObjectsRemaining = completedObjectKeys.size;
    const unfinishedUploadsRemaining = initializedUploads.filter((upload) => !upload.completed).length;
    report.cleanup = {
      attemptedObjects: initializedUploads.length,
      completedObjectsRemaining,
      unfinishedUploadsRemaining,
      unfinished: initializedUploads.filter((upload) => !upload.completed).map((upload) => ({ objectKey: upload.objectKey, uploadId: upload.uploadId })),
      errors: [...incompleteErrors, ...deleteErrors]
    };
    report.finishedAt = new Date().toISOString();
    report.metricsSamples = metricsSamples;
    report.operations = summarizeOperations();
    report.operationErrors = operations.filter((operation) => !operation.ok);
    report.errors = errors;
    report.expectedUploads = profile.imageClients + profile.videoClients;
    report.completedUploads = initializedUploads.filter((upload) => upload.completed).length;
    report.verifiedUploads = initializedUploads.filter((upload) => upload.verified).length;
    report.requestCount = operations.filter((operation) => !operation.operation.startsWith("s3-delete")).length;
    report.failedRequestCount = operations.filter((operation) => !operation.ok && !operation.operation.startsWith("s3-delete")).length;
    report.healthFailures = safetyFailure ? 1 : 0;
    report.containerRestarts = Number(process.env.CONTAINER_RESTARTS || 0);
    report.peakApiRssBytes = Math.max(0, ...metricsSamples.map((sample) => sample.memoryRssBytes || 0));
    report.thresholdEvaluation = evaluateS3Thresholds(report, {
      apiRssLimitBytes: profile.apiRssLimitBytes,
      maxErrorRate: profile.maxErrorRate
    });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      reportPath,
      runId,
      failure: report.failure || null,
      phases: report.phases,
      cleanup: report.cleanup,
      thresholdsPassed: report.thresholdEvaluation.passed
    }, null, 2));
  }

  if (report.failure || report.cleanup.errors.length || !report.thresholdEvaluation.passed) process.exitCode = 1;
}

await main();
