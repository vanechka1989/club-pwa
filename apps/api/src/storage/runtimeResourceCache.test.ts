import { describe, expect, it, vi } from "vitest";
import { createRuntimeResourceCache } from "./runtimeResourceCache";

describe("runtime resource cache", () => {
  it("shares one in-flight load between concurrent readers", async () => {
    let resolveLoad!: (value: { id: number }) => void;
    const load = vi.fn(() => new Promise<{ id: number }>((resolve) => (resolveLoad = resolve)));
    const cache = createRuntimeResourceCache({ load, ttlMs: 60_000 });

    const first = cache.get();
    const second = cache.get();
    resolveLoad({ id: 1 });

    await expect(first).resolves.toEqual({ id: 1 });
    await expect(second).resolves.toEqual({ id: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after expiry and disposes resources on invalidation", async () => {
    let now = 1_000;
    const dispose = vi.fn();
    const load = vi.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 });
    const cache = createRuntimeResourceCache({ load, ttlMs: 100, dispose, now: () => now });

    await expect(cache.get()).resolves.toEqual({ id: 1 });
    now = 1_101;
    await expect(cache.get()).resolves.toEqual({ id: 2 });
    expect(dispose).toHaveBeenCalledWith({ id: 1 });

    cache.invalidate();
    expect(dispose).toHaveBeenCalledWith({ id: 2 });
    await expect(cache.get()).resolves.toEqual({ id: 3 });
  });

  it("does not retain a rejected load", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ id: 2 });
    const cache = createRuntimeResourceCache({ load, ttlMs: 100 });

    await expect(cache.get()).rejects.toThrow("temporary");
    await expect(cache.get()).resolves.toEqual({ id: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
