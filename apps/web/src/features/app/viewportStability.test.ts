import { describe, expect, it, vi } from "vitest";
import { createViewportSyncScheduler, stabilizeViewportMetric } from "./viewportStability";

describe("viewport stability", () => {
  it("ignores subpixel viewport noise but applies meaningful changes", () => {
    expect(stabilizeViewportMetric(844, 844.6, 1)).toBe(844);
    expect(stabilizeViewportMetric(844, 842.8, 1)).toBe(843);
    expect(stabilizeViewportMetric(0, 844.4, 1)).toBe(844);
  });

  it("coalesces resize bursts and performs one trailing reconciliation", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const scheduler = createViewportSyncScheduler(callback, {
      requestFrame: (handler) => window.setTimeout(handler, 16),
      cancelFrame: (handle) => window.clearTimeout(handle),
      setTimer: (handler, delay) => window.setTimeout(handler, delay),
      clearTimer: (handle) => window.clearTimeout(handle),
      trailingDelayMs: 120
    });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    vi.advanceTimersByTime(16);
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    vi.advanceTimersByTime(16);
    expect(callback).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(120);
    expect(callback).toHaveBeenCalledTimes(3);

    scheduler.cancel();
    vi.useRealTimers();
  });
});
