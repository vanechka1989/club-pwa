export function createSseParser(onEvent) {
  let buffer = "";

  return {
    push(chunk) {
      buffer += chunk.replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = { event: "message", id: "", data: "" };
        const data = [];
        for (const line of frame.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          const separator = line.indexOf(":");
          const field = separator < 0 ? line : line.slice(0, separator);
          const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
          if (field === "event") parsed.event = value;
          if (field === "id") parsed.id = value;
          if (field === "data") data.push(value);
        }
        parsed.data = data.join("\n");
        if (frame.trim()) onEvent(parsed);
        boundary = buffer.indexOf("\n\n");
      }
    }
  };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

export function latencySummary(values) {
  if (!values.length) {
    return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, average: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1),
    average: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
  };
}

export function deliverySummary({ expectedClients, expectedEventsPerClient, receivedByClient, duplicateCount = 0 }) {
  const expected = expectedClients * expectedEventsPerClient;
  const received = receivedByClient.reduce((sum, value) => sum + Math.min(value, expectedEventsPerClient), 0);
  return {
    expected,
    received,
    lost: Math.max(0, expected - received),
    duplicates: duplicateCount,
    deliveryRate: expected ? received / expected : 1,
    completeClients: receivedByClient.filter((value) => value >= expectedEventsPerClient).length
  };
}

export const productionThresholds = {
  deliveryRate: 1,
  duplicates: 0,
  sseP95Ms: 500,
  sseP99Ms: 1500,
  httpErrorRate: 0.005,
  httpP95Ms: 500,
  httpP99Ms: 1500
};

export function evaluateThresholds(report, thresholds = productionThresholds) {
  const httpAttempts = Math.max(1, report.http?.requests || 0);
  const httpErrorRate = (report.http?.failedClients || 0) / httpAttempts;
  const checks = {
    delivery: report.burst?.delivery?.deliveryRate >= thresholds.deliveryRate,
    duplicates: report.burst?.delivery?.duplicates <= thresholds.duplicates,
    sseP95: report.sequential?.p95 <= thresholds.sseP95Ms,
    sseP99: report.sequential?.p99 <= thresholds.sseP99Ms,
    httpErrors: httpErrorRate <= thresholds.httpErrorRate,
    httpP95: report.http?.latency?.p95 <= thresholds.httpP95Ms,
    httpP99: report.http?.latency?.p99 <= thresholds.httpP99Ms,
    clientFailures: (report.clientFailures?.length || 0) === 0
  };
  return { passed: Object.values(checks).every(Boolean), checks, httpErrorRate };
}

const profiles = {
  smoke: { clients: 5, rampTargets: [5], rampPauseMs: 1_000, holdMs: 0, sequentialMessages: 2, burstMessages: 3, reconnectClients: 2, httpRounds: 1 },
  "production-100": { clients: 100, rampTargets: [10, 25, 50, 75, 100], rampPauseMs: 10_000, holdMs: 180_000, sequentialMessages: 10, burstMessages: 20, reconnectClients: 25, httpRounds: 3 }
};

export function resolveLoadProfile(name) {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown load profile: ${name}`);
  return profile;
}
