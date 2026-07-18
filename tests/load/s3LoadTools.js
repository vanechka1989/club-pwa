const MiB = 1024 * 1024;

const profiles = {
  smoke: {
    imageClients: 3,
    imageSizeBytes: 1 * MiB,
    imageRampTargets: [3],
    videoClients: 2,
    videoSizeBytes: 9 * MiB,
    stagePauseMs: 500,
    apiRssLimitBytes: 1_500_000_000,
    maxErrorRate: 0.01
  },
  "production-100": {
    imageClients: 100,
    imageSizeBytes: 2 * MiB,
    imageRampTargets: [5, 10, 25, 50, 75, 100],
    videoClients: 25,
    videoSizeBytes: 24 * MiB,
    stagePauseMs: 2_000,
    apiRssLimitBytes: 1_500_000_000,
    maxErrorRate: 0.01
  }
};

export function resolveS3LoadProfile(name) {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown S3 load profile: ${name}`);
  return structuredClone(profile);
}

export function buildRampBatches(targets) {
  let previous = 0;
  return targets.map((target) => {
    if (!Number.isInteger(target) || target <= previous) {
      throw new Error("S3 load ramp targets must be strictly increasing positive integers");
    }
    const batch = target - previous;
    previous = target;
    return batch;
  });
}

export function buildVerificationRetryDelays() {
  return [0, 250, 500, 1000, 2000, 3000];
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

export function makeDeterministicPayload(sizeBytes, seed) {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new Error("Payload size must be a positive integer");
  const buffer = Buffer.allocUnsafe(sizeBytes);
  let state = (seed >>> 0) || 1;
  for (let index = 0; index < sizeBytes; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    buffer[index] = state & 0xff;
  }
  return buffer;
}

export const s3ProductionThresholds = {
  apiRssLimitBytes: 1_500_000_000,
  maxErrorRate: 0.01
};

export function evaluateS3Thresholds(report, thresholds = s3ProductionThresholds) {
  const requestCount = Math.max(1, report.requestCount || 0);
  const errorRate = (report.failedRequestCount || 0) / requestCount;
  const cleanup = report.cleanup || {};
  const checks = {
    completion: report.completedUploads === report.expectedUploads,
    verification: report.verifiedUploads === report.expectedUploads,
    requestErrors: errorRate <= thresholds.maxErrorRate,
    health: (report.healthFailures || 0) === 0,
    restarts: (report.containerRestarts || 0) === 0,
    memory: (report.peakApiRssBytes || 0) <= thresholds.apiRssLimitBytes,
    cleanup:
      (cleanup.completedObjectsRemaining || 0) === 0 &&
      (cleanup.unfinishedUploadsRemaining || 0) === 0 &&
      (cleanup.errors?.length || 0) === 0
  };
  return { passed: Object.values(checks).every(Boolean), checks, errorRate };
}
