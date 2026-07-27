import { describe, expect, it, vi } from "vitest";
import { startErrorTrackerCleanupJob } from "./cleanupJob";

describe("error tracker cleanup job", () => {
  it("runs cleanup immediately and returns a stoppable timer", async () => {
    vi.useFakeTimers();
    const prune = vi.fn().mockResolvedValue(undefined);
    const timer = startErrorTrackerCleanupJob(prune);
    await vi.runAllTicks();
    expect(prune).toHaveBeenCalledOnce();
    clearInterval(timer);
    vi.useRealTimers();
  });
});
