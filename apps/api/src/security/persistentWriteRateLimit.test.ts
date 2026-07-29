import { expect, it, vi } from "vitest";
import { consumePersistentWriteAllowance } from "./persistentWriteRateLimit";

it("derives write allowance from the atomically returned database row", async () => {
  const now = new Date("2026-07-29T12:00:30.000Z");
  const returning = vi.fn(async () => [{
    attemptCount: 61,
    windowStartedAt: new Date("2026-07-29T12:00:00.000Z")
  }]);
  const database = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({ returning }))
      }))
    }))
  };

  await expect(consumePersistentWriteAllowance("community", "user-1", 60, 60_000, {
    database: database as never,
    now
  })).resolves.toEqual({ allowed: false, retryAfterSeconds: 30 });
  expect(returning).toHaveBeenCalledTimes(1);
});
