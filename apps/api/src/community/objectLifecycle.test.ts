import { describe, expect, it, vi } from "vitest";
import {
  CommunityObjectIoTimeoutError,
  createCommunityObjectConvergentDeletion,
  createCommunityObjectIoGate,
  createCommunityObjectTombstoneReconciler,
  type CommunityObjectTombstoneCandidate
} from "./objectLifecycle";

describe("community object lifecycle", () => {
  it("waits for two separated absence proofs before completing terminal cleanup", async () => {
    const events: string[] = [];
    let pass = 0;
    const remove = createCommunityObjectConvergentDeletion({
      tombstone: async (keys) => { events.push(`tombstone:${keys.join(",")}`); },
      reconcile: async () => {
        pass += 1;
        events.push(`reconcile:${pass}`);
        return {
          stableKeys: pass >= 2 ? ["community/final/stable.webp"] : [],
          pendingKeys: pass >= 2 ? [] : ["community/final/stable.webp"],
          failedTargets: []
        };
      },
      wait: async (milliseconds) => { events.push(`wait:${milliseconds}`); },
      stableGapMs: 25
    });

    await expect(remove(["community/final/stable.webp"])).resolves.toBeUndefined();
    expect(events).toEqual([
      "tombstone:community/final/stable.webp",
      "reconcile:1",
      "wait:25",
      "reconcile:2"
    ]);
  });

  it("bounds concurrent storage work and releases a permit after an abort deadline", async () => {
    const gate = createCommunityObjectIoGate({ maxConcurrency: 2, timeoutMs: 20 });
    let active = 0;
    let maximumActive = 0;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondBlocked = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const started: number[] = [];

    const first = gate.run(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(1);
      await firstBlocked;
      active -= 1;
    });
    const second = gate.run(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(2);
      await secondBlocked;
      active -= 1;
    });
    const third = gate.run(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(3);
      active -= 1;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toEqual([1, 2]);
    releaseFirst();
    await third;
    releaseSecond();
    await Promise.all([first, second]);
    expect(maximumActive).toBe(2);

    await expect(gate.run((signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }))).rejects.toBeInstanceOf(CommunityObjectIoTimeoutError);
  });

  it("times out queued work while a provider call ignores cancellation without exceeding the budget", async () => {
    const gate = createCommunityObjectIoGate({ maxConcurrency: 1, timeoutMs: 20 });
    let releaseProvider!: () => void;
    const provider = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const first = gate.run(async () => provider).then(() => null, (error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(gate.run(async () => undefined)).rejects.toBeInstanceOf(CommunityObjectIoTimeoutError);
    releaseProvider();
    await expect(first).resolves.toBeInstanceOf(CommunityObjectIoTimeoutError);
    await expect(gate.run(async () => "recovered")).resolves.toBe("recovered");
  });

  it("keeps per-target tombstones after stable absence and re-deletes a provider-side late write", async () => {
    const rows: CommunityObjectTombstoneCandidate[] = [
      {
        objectKey: "community/final/late.webp",
        target: "primary",
        generation: 7,
        claimId: "00000000-0000-4000-8000-000000000701",
        absenceCount: 0,
        expectedTargetCount: 2
      },
      {
        objectKey: "community/final/late.webp",
        target: "reserve",
        generation: 7,
        claimId: "00000000-0000-4000-8000-000000000702",
        absenceCount: 0,
        expectedTargetCount: 2
      }
    ];
    const deleteTarget = vi.fn(async () => undefined);
    const reconciler = createCommunityObjectTombstoneReconciler({
      repository: {
        claimBatch: async () => rows.map((row) => ({ ...row })),
        markAbsent: async (candidate) => {
          const row = rows.find((item) => item.target === candidate.target)!;
          row.absenceCount += 1;
          return { stable: row.absenceCount >= 2 };
        },
        release: async () => undefined
      },
      deleteTarget,
      concurrency: 2
    });

    await expect(reconciler({ limit: 10 })).resolves.toEqual({
      stableKeys: [],
      pendingKeys: ["community/final/late.webp"],
      failedTargets: []
    });
    await expect(reconciler({ limit: 10 })).resolves.toEqual({
      stableKeys: ["community/final/late.webp"],
      pendingKeys: [],
      failedTargets: []
    });

    // A stable tombstone is never removed. A later provider-side completion is
    // therefore deleted by the next audit instead of resurrecting the object.
    await expect(reconciler({ limit: 10 })).resolves.toEqual({
      stableKeys: ["community/final/late.webp"],
      pendingKeys: [],
      failedTargets: []
    });
    expect(deleteTarget.mock.calls).toEqual([
      ["community/final/late.webp", "primary"],
      ["community/final/late.webp", "reserve"],
      ["community/final/late.webp", "primary"],
      ["community/final/late.webp", "reserve"],
      ["community/final/late.webp", "primary"],
      ["community/final/late.webp", "reserve"]
    ]);
  });
});
