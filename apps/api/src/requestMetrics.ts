export function createRequestMetrics() {
  let requests = 0;
  let failedRequests = 0;
  let totalDurationMs = 0;
  let maxDurationMs = 0;

  return {
    record(status: number, durationMs: number) {
      requests += 1;
      if (status >= 500) failedRequests += 1;
      totalDurationMs += durationMs;
      maxDurationMs = Math.max(maxDurationMs, durationMs);
    },
    snapshot() {
      return {
        requests,
        failedRequests,
        averageDurationMs: requests ? Math.round(totalDurationMs / requests) : 0,
        maxDurationMs: Math.round(maxDurationMs)
      };
    }
  };
}

export const requestMetrics = createRequestMetrics();
