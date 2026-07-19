type RequestMetric = {
  at: number;
  status: number;
  durationMs: number;
};

type RequestMetricsOptions = {
  now?: () => number;
  windowMs?: number;
  maxSamples?: number;
};

export function createRequestMetrics(options: RequestMetricsOptions = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 5 * 60_000;
  const maxSamples = options.maxSamples ?? 20_000;
  const samples: RequestMetric[] = [];

  function prune() {
    const cutoff = now() - windowMs;
    while (samples.length && samples[0]!.at < cutoff) samples.shift();
    if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples);
  }

  return {
    record(status: number, durationMs: number) {
      samples.push({ at: now(), status, durationMs: Math.max(0, durationMs) });
      prune();
    },
    snapshot() {
      prune();
      const requests = samples.length;
      const failedRequests = samples.filter((sample) => sample.status >= 500).length;
      const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
      const totalDurationMs = durations.reduce((sum, duration) => sum + duration, 0);
      const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);

      return {
        requests,
        failedRequests,
        requestsPerMinute: Number(((requests * 60_000) / windowMs).toFixed(1)),
        errorRatePercent: requests ? Number(((failedRequests / requests) * 100).toFixed(1)) : 0,
        averageDurationMs: requests ? Math.round(totalDurationMs / requests) : 0,
        p95DurationMs: requests ? Math.round(durations[p95Index]!) : 0,
        maxDurationMs: requests ? Math.round(durations[durations.length - 1]!) : 0,
        windowSeconds: Math.round(windowMs / 1_000)
      };
    }
  };
}

export const requestMetrics = createRequestMetrics();
