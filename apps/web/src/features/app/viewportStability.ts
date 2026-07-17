export type ViewportSyncScheduler = {
  schedule: () => void;
  flush: () => void;
  cancel: () => void;
};

type ViewportSyncSchedulerOptions = {
  requestFrame: (handler: () => void) => number;
  cancelFrame: (handle: number) => void;
  setTimer: (handler: () => void, delay: number) => number;
  clearTimer: (handle: number) => void;
  trailingDelayMs?: number;
};

export function stabilizeViewportMetric(previous: number, next: number, tolerance = 1) {
  const normalizedNext = Math.round(next);
  if (!Number.isFinite(previous) || previous <= 0) {
    return normalizedNext;
  }

  return Math.abs(previous - next) < tolerance ? previous : normalizedNext;
}

export function createViewportSyncScheduler(
  callback: () => void,
  options: ViewportSyncSchedulerOptions
): ViewportSyncScheduler {
  const trailingDelayMs = options.trailingDelayMs ?? 120;
  let frameHandle: number | null = null;
  let timerHandle: number | null = null;

  const run = () => {
    frameHandle = null;
    callback();
  };

  const schedule = () => {
    if (frameHandle === null) {
      frameHandle = options.requestFrame(run);
    }

    if (timerHandle !== null) {
      options.clearTimer(timerHandle);
    }
    timerHandle = options.setTimer(() => {
      timerHandle = null;
      callback();
    }, trailingDelayMs);
  };

  const flush = () => {
    if (frameHandle !== null) {
      options.cancelFrame(frameHandle);
      frameHandle = null;
    }
    if (timerHandle !== null) {
      options.clearTimer(timerHandle);
      timerHandle = null;
    }
    callback();
  };

  const cancel = () => {
    if (frameHandle !== null) {
      options.cancelFrame(frameHandle);
      frameHandle = null;
    }
    if (timerHandle !== null) {
      options.clearTimer(timerHandle);
      timerHandle = null;
    }
  };

  return { schedule, flush, cancel };
}
