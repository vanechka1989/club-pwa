import { describe, expect, it, vi } from "vitest";
import {
  CommunityObjectIoTimeoutError,
  CommunityObjectReconciliationBackpressureError,
  calculateCommunityObjectTombstoneSweepPlan,
  communityObjectProviderUncertaintyMs,
  communityObjectTombstoneAuditMs,
  communityObjectTombstoneCapacityTargets,
  communityObjectTombstoneDeleteConcurrency,
  communityObjectTombstoneDeleteTimeoutMs,
  communityObjectTombstoneShardCount,
  communityObjectTombstoneWorstCaseSlaMs,
  createCommunityObjectTombstoneSweep,
  createCommunityObjectTombstoneMetrics,
  createCommunityObjectPublicationCapacityGate,
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

  it("allocates every due target within capacity across skewed shards and signals backpressure above capacity", () => {
    const withinCapacity = calculateCommunityObjectTombstoneSweepPlan({
      hotTargetCount: 1_200,
      dueTargetCount: 1_200,
      dueByShard: [1_200, ...Array(communityObjectTombstoneShardCount - 1).fill(0)],
      oldestDueAt: new Date("2026-07-30T10:00:00.000Z"),
      now: new Date("2026-07-30T10:00:30.000Z")
    });
    expect(withinCapacity.shardLimits[0]).toBe(communityObjectTombstoneDeleteConcurrency);
    expect(withinCapacity.shardLimits.reduce((sum, value) => sum + value, 0))
      .toBe(communityObjectTombstoneDeleteConcurrency);
    expect(withinCapacity.overloaded).toBe(false);
    expect(withinCapacity.worstCaseLateWriteMs).toBeLessThanOrEqual(communityObjectTombstoneWorstCaseSlaMs);

    const maximallyFragmentedCapacity = calculateCommunityObjectTombstoneSweepPlan({
      hotTargetCount: communityObjectTombstoneCapacityTargets,
      dueTargetCount: communityObjectTombstoneCapacityTargets,
      dueByShard: [
        communityObjectTombstoneCapacityTargets - communityObjectTombstoneShardCount + 1,
        ...Array(communityObjectTombstoneShardCount - 1).fill(1)
      ],
      oldestDueAt: new Date("2026-07-30T10:00:00.000Z"),
      now: new Date("2026-07-30T10:00:00.000Z")
    });
    expect(maximallyFragmentedCapacity.worstCaseLateWriteMs)
      .toBeLessThanOrEqual(communityObjectTombstoneWorstCaseSlaMs);
    expect(maximallyFragmentedCapacity.slaAtRisk).toBe(false);

    const overloaded = calculateCommunityObjectTombstoneSweepPlan({
      hotTargetCount: communityObjectTombstoneCapacityTargets + 1,
      dueTargetCount: communityObjectTombstoneCapacityTargets + 500,
      dueByShard: Array.from(
        { length: communityObjectTombstoneShardCount },
        (_value, index) => index === 0 ? communityObjectTombstoneCapacityTargets + 500 : 0
      ),
      oldestDueAt: new Date("2026-07-30T09:30:00.000Z"),
      now: new Date("2026-07-30T10:00:00.000Z")
    });
    expect(overloaded.shardLimits.reduce((sum, value) => sum + value, 0))
      .toBe(communityObjectTombstoneDeleteConcurrency);
    expect(overloaded).toMatchObject({ overloaded: true, backpressure: true, slaAtRisk: true });
  });

  it("runs adaptive shard claims and emits a capacity alert with measurable pressure", async () => {
    const reconcileShard = vi.fn(async ({ shard, limit }: { shard: number; limit: number }) => ({
      stableKeys: [`stable-${shard}-${limit}`],
      pendingKeys: [],
      failedTargets: []
    }));
    const warn = vi.fn();
    const sweep = createCommunityObjectTombstoneSweep({
      loadPressure: async () => ({
        hotTargetCount: communityObjectTombstoneCapacityTargets + 1,
        dueTargetCount: communityObjectTombstoneCapacityTargets + 1,
        dueByShard: [communityObjectTombstoneCapacityTargets + 1, ...Array(communityObjectTombstoneShardCount - 1).fill(0)],
        oldestDueAt: new Date("2026-07-30T09:30:00.000Z")
      }),
      reconcileShard,
      now: () => new Date("2026-07-30T10:00:00.000Z"),
      logger: { warn },
      maxRounds: 1
    });

    const result = await sweep();

    expect(reconcileShard).toHaveBeenCalledWith({
      shard: 0,
      shardCount: communityObjectTombstoneShardCount,
      limit: communityObjectTombstoneDeleteConcurrency
    });
    expect(result.pressure).toMatchObject({ backpressure: true, slaAtRisk: true });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      hotTargetCount: communityObjectTombstoneCapacityTargets + 1,
      capacityTargets: communityObjectTombstoneCapacityTargets,
      slaMs: communityObjectTombstoneWorstCaseSlaMs
    }), "community object tombstone capacity alert");
  });

  it("dispatches one bounded oldest-first lease round across shards without over-queuing the global gate", async () => {
    let activeShards = 0;
    let maximumActiveShards = 0;
    const sweep = createCommunityObjectTombstoneSweep({
      loadPressure: async () => ({
        hotTargetCount: 32,
        dueTargetCount: 32,
        dueByShard: Array(communityObjectTombstoneShardCount).fill(2),
        oldestDueAt: new Date("2026-07-30T09:59:00.000Z")
      }),
      reconcileShard: async () => {
        activeShards += 1;
        maximumActiveShards = Math.max(maximumActiveShards, activeShards);
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeShards -= 1;
        return { stableKeys: [], pendingKeys: [], failedTargets: [] };
      },
      logger: { warn: vi.fn() },
      maxRounds: 1
    });

    await sweep();
    expect(maximumActiveShards).toBeGreaterThan(1);
  });

  it("publishes hot-queue pressure, SLA risk, and backpressure counters for monitoring", () => {
    const metrics = createCommunityObjectTombstoneMetrics({
      now: () => new Date("2026-07-30T10:00:00.000Z")
    });
    const pressure = {
      hotTargetCount: 1_800,
      dueTargetCount: 900,
      dueByShard: [900, ...Array(communityObjectTombstoneShardCount - 1).fill(0)],
      oldestDueAt: new Date("2026-07-30T09:59:00.000Z")
    };
    metrics.recordSweep(pressure, calculateCommunityObjectTombstoneSweepPlan({
      ...pressure,
      now: new Date("2026-07-30T10:00:00.000Z")
    }));
    metrics.recordBackpressure();

    expect(metrics.snapshot()).toMatchObject({
      hotTargetCount: 1_800,
      dueTargetCount: 900,
      capacityTargets: communityObjectTombstoneCapacityTargets,
      worstCaseSlaMs: communityObjectTombstoneWorstCaseSlaMs,
      backpressureEvents: 1,
      lastSweepAt: "2026-07-30T10:00:00.000Z"
    });
  });

  it("blocks new provider writes when the hot queue is beyond its proven capacity", async () => {
    const admitted = createCommunityObjectPublicationCapacityGate(async () => ({
      hotTargetCount: communityObjectTombstoneCapacityTargets,
      dueTargetCount: 0,
      dueByShard: Array(communityObjectTombstoneShardCount).fill(0),
      oldestDueAt: null
    }));
    const rejected = createCommunityObjectPublicationCapacityGate(async () => ({
      hotTargetCount: communityObjectTombstoneCapacityTargets + 1,
      dueTargetCount: 1,
      dueByShard: [1, ...Array(communityObjectTombstoneShardCount - 1).fill(0)],
      oldestDueAt: new Date()
    }));

    await expect(admitted()).resolves.toBeUndefined();
    await expect(rejected()).rejects.toBeInstanceOf(CommunityObjectReconciliationBackpressureError);
  });

  it("drains an above-capacity burst while new tombstones keep arriving without starving the oldest late write", async () => {
    vi.useFakeTimers();
    try {
      const keyCount = 1_100;
      const rows: CommunityObjectTombstoneCandidate[] = Array.from({ length: keyCount }, (_value, index) =>
        (["primary", "reserve"] as const).map((target, targetIndex) => ({
          objectKey: `community/final/load-${index}.webp`,
          target,
          generation: 3,
          claimId: `${index}-${targetIndex}`,
          absenceCount: 1,
          expectedTargetCount: 2
        }))
      ).flat();
      let active = 0;
      let maximumActive = 0;
      const deleted = new Set<string>();
      const providerGate = createCommunityObjectIoGate({
        maxConcurrency: communityObjectTombstoneDeleteConcurrency,
        timeoutMs: communityObjectTombstoneDeleteTimeoutMs
      });
      let currentRows = rows;
      let latestInitialDeletedAt: number | null = null;
      const startedAt = Date.now();
      const sweep = createCommunityObjectTombstoneSweep({
        loadPressure: async () => ({
          hotTargetCount: currentRows.length,
          dueTargetCount: currentRows.length,
          dueByShard: Array.from({ length: communityObjectTombstoneShardCount }, (_value, shard) =>
            currentRows.filter((row) => Number(row.objectKey.match(/(\d+)/)?.[1] ?? 0) % communityObjectTombstoneShardCount === shard).length),
          oldestDueAt: currentRows.length ? new Date(startedAt) : null
        }),
        reconcileShard: async ({ shard, shardCount, limit }) => {
          const claimed = currentRows
            .filter((row) => Number(row.objectKey.match(/(\d+)/)?.[1] ?? 0) % shardCount === shard)
            .slice(0, limit);
          await Promise.all(claimed.map((row) => providerGate.run(async () => {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await new Promise<void>((resolve) => setTimeout(resolve, communityObjectTombstoneDeleteTimeoutMs - 1));
            deleted.add(`${row.objectKey}:${row.target}`);
            if (row.objectKey.startsWith("community/final/load-")) {
              latestInitialDeletedAt = Math.max(latestInitialDeletedAt ?? 0, Date.now());
            }
            active -= 1;
          })));
          const claimedIds = new Set(claimed.map((row) => `${row.objectKey}:${row.target}`));
          currentRows = currentRows.filter((row) => !claimedIds.has(`${row.objectKey}:${row.target}`));
          // One shard injects 16 new targets per 15-second round (64/minute),
          // while every shard continues to lease its oldest rows first.
          if (shard === 0) {
            const generation = deleted.size;
            currentRows.push(...Array.from({ length: 16 }, (_value, index) => ({
              objectKey: `community/final/continuous-${generation + index}.webp`,
              target: (index % 2 ? "reserve" : "primary") as "primary" | "reserve",
              generation: 4,
              claimId: `continuous-${generation + index}`,
              absenceCount: 1,
              expectedTargetCount: 1
            })));
          }
          return { stableKeys: [], pendingKeys: [], failedTargets: [] };
        },
        now: () => new Date(Date.now()),
        logger: { warn: vi.fn() }
      });
      const run = sweep();
      await vi.runAllTimersAsync();
      const result = await run;
      const maximumInitialLateWriteDelayMs = communityObjectTombstoneAuditMs
        + 60_000
        + (latestInitialDeletedAt! - startedAt);

      expect(rows.length).toBeGreaterThan(communityObjectTombstoneCapacityTargets);
      expect(rows.every((row) => deleted.has(`${row.objectKey}:${row.target}`))).toBe(true);
      expect(deleted.size).toBeGreaterThan(rows.length);
      expect(maximumActive).toBe(communityObjectTombstoneDeleteConcurrency);
      expect(maximumInitialLateWriteDelayMs).toBeLessThanOrEqual(communityObjectTombstoneWorstCaseSlaMs);
      expect(result.pressure.serviceRateTargetsPerMinute).toBeGreaterThan(0);
      expect(communityObjectProviderUncertaintyMs).toBeGreaterThan(communityObjectTombstoneWorstCaseSlaMs);
    } finally {
      vi.useRealTimers();
    }
  });
});
