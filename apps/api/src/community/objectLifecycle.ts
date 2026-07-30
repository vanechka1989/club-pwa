import { sql } from "drizzle-orm";

export const communityObjectIoConcurrency = 4;
export const communityObjectIoTimeoutMs = 2 * 60_000;
export const communityObjectAbsenceStableMs = 1_000;
export const communityObjectTombstoneAuditMs = 5 * 60_000;
export const communityObjectTombstoneClaimStaleMs = 5 * 60_000;
export const communityObjectTombstoneBatchSize = 100;
export const communityObjectProviderUncertaintyMs = 30 * 60_000;
export const communityObjectTombstoneWorstCaseSlaMs = 15 * 60_000;
export const communityObjectTombstoneDeleteTimeoutMs = 15_000;
export const communityObjectTombstoneDeleteConcurrency = 64;
export const communityObjectTombstoneShardCount = 16;
export const communityObjectTombstoneWorkerTickMs = 60_000;
export const communityObjectTombstoneLeaseRoundTargets = communityObjectTombstoneDeleteConcurrency;
export const communityObjectTombstoneSweepOverheadReserveMs = 15_000;
export const communityObjectTombstoneServiceRateTargetsPerMinute = Math.floor(
  communityObjectTombstoneLeaseRoundTargets * 60_000 / communityObjectTombstoneDeleteTimeoutMs
);
export const communityObjectTombstoneMaxSweepRounds = Math.floor(
  (communityObjectTombstoneWorstCaseSlaMs
    - communityObjectTombstoneAuditMs
    - communityObjectTombstoneWorkerTickMs
    - communityObjectTombstoneSweepOverheadReserveMs)
  / communityObjectTombstoneDeleteTimeoutMs
);
export const communityObjectTombstoneCapacityTargets =
  communityObjectTombstoneLeaseRoundTargets * (communityObjectTombstoneMaxSweepRounds - 1);

export type CommunityObjectStorageTarget = "primary" | "reserve";

export type CommunityObjectTombstonePressure = {
  hotTargetCount: number;
  dueTargetCount: number;
  dueByShard: number[];
  oldestDueAt: Date | null;
};

export class CommunityObjectReconciliationBackpressureError extends Error {
  constructor() {
    super("community_object_reconciliation_backpressure");
    this.name = "CommunityObjectReconciliationBackpressureError";
  }
}

export function createCommunityObjectPublicationCapacityGate(
  loadPressure: () => Promise<CommunityObjectTombstonePressure>
) {
  return async function assertCommunityObjectPublicationCapacity() {
    const pressure = await loadPressure();
    const plan = calculateCommunityObjectTombstoneSweepPlan({ ...pressure, now: new Date() });
    if (plan.backpressure) {
      throw new CommunityObjectReconciliationBackpressureError();
    }
  };
}

export function calculateCommunityObjectTombstoneSweepPlan(
  pressure: CommunityObjectTombstonePressure & { now: Date }
) {
  const dueByShard = Array.from(
    { length: communityObjectTombstoneShardCount },
    (_value, shard) => Math.max(0, Math.trunc(pressure.dueByShard[shard] ?? 0))
  );
  const targetLimit = Math.min(
    communityObjectTombstoneLeaseRoundTargets,
    Math.max(0, Math.trunc(pressure.dueTargetCount)),
    dueByShard.reduce((sum, value) => sum + value, 0)
  );
  const shardLimits = Array(communityObjectTombstoneShardCount).fill(0) as number[];
  let remaining = targetLimit;
  while (remaining > 0) {
    let allocated = false;
    for (let shard = 0; shard < communityObjectTombstoneShardCount && remaining > 0; shard += 1) {
      if (shardLimits[shard]! >= dueByShard[shard]!) continue;
      shardLimits[shard] = shardLimits[shard]! + 1;
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) break;
  }
  const processingMs = targetLimit > 0 ? communityObjectTombstoneDeleteTimeoutMs : 0;
  const estimatedDrainMs = Math.ceil(
    Math.max(0, pressure.dueTargetCount) / communityObjectTombstoneLeaseRoundTargets
  ) * communityObjectTombstoneDeleteTimeoutMs;
  const worstCaseLateWriteMs = communityObjectTombstoneAuditMs
    + communityObjectTombstoneWorkerTickMs
    + estimatedDrainMs;
  const oldestDueAgeMs = pressure.oldestDueAt
    ? Math.max(0, pressure.now.getTime() - pressure.oldestDueAt.getTime())
    : 0;
  const overloaded = pressure.hotTargetCount > communityObjectTombstoneCapacityTargets
    || pressure.dueTargetCount > communityObjectTombstoneCapacityTargets;
  const slaAtRisk = communityObjectTombstoneAuditMs
    + communityObjectTombstoneWorkerTickMs
    + oldestDueAgeMs
    + estimatedDrainMs > communityObjectTombstoneWorstCaseSlaMs;
  return {
    shardLimits,
    targetLimit,
    processingMs,
    estimatedDrainMs,
    worstCaseLateWriteMs,
    overloaded,
    backpressure: overloaded || slaAtRisk,
    slaAtRisk,
    oldestDueAgeMs,
    serviceRateTargetsPerMinute: communityObjectTombstoneServiceRateTargetsPerMinute
  };
}

type CommunityObjectTombstoneSweepPlan = ReturnType<typeof calculateCommunityObjectTombstoneSweepPlan>;

export function createCommunityObjectTombstoneMetrics(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  let hotTargetCount = 0;
  let dueTargetCount = 0;
  let oldestDueAt: string | null = null;
  let lastSweepAt: string | null = null;
  let estimatedProcessingMs = 0;
  let slaAtRisk = false;
  let backpressure = false;
  let backpressureEvents = 0;
  return {
    recordSweep(pressure: CommunityObjectTombstonePressure, plan: CommunityObjectTombstoneSweepPlan) {
      hotTargetCount = pressure.hotTargetCount;
      dueTargetCount = pressure.dueTargetCount;
      oldestDueAt = pressure.oldestDueAt?.toISOString() ?? null;
      estimatedProcessingMs = plan.estimatedDrainMs;
      slaAtRisk = plan.slaAtRisk;
      backpressure = plan.backpressure;
      lastSweepAt = now().toISOString();
    },
    recordBackpressure() {
      backpressureEvents += 1;
      backpressure = true;
    },
    snapshot() {
      return {
        hotTargetCount,
        dueTargetCount,
        oldestDueAt,
        lastSweepAt,
        estimatedProcessingMs,
        slaAtRisk,
        backpressure,
        backpressureEvents,
        capacityTargets: communityObjectTombstoneCapacityTargets,
        worstCaseSlaMs: communityObjectTombstoneWorstCaseSlaMs,
        providerUncertaintyMs: communityObjectProviderUncertaintyMs,
        serviceRateTargetsPerMinute: communityObjectTombstoneServiceRateTargetsPerMinute,
        maxSweepRounds: communityObjectTombstoneMaxSweepRounds
      };
    }
  };
}

export const communityObjectTombstoneMetrics = createCommunityObjectTombstoneMetrics();

type CommunityObjectTombstoneSweepResult = {
  stableKeys: string[];
  pendingKeys: string[];
  failedTargets: Array<unknown>;
};

export function createCommunityObjectTombstoneSweep(dependencies: {
  loadPressure: () => Promise<CommunityObjectTombstonePressure>;
  reconcileShard: (input: { shard: number; shardCount: number; limit: number }) => Promise<CommunityObjectTombstoneSweepResult>;
  now?: () => Date;
  logger: { warn: (fields: Record<string, unknown>, message: string) => void };
  maxRounds?: number;
}) {
  const now = dependencies.now ?? (() => new Date());
  return async function sweepCommunityObjectTombstones() {
    const results: CommunityObjectTombstoneSweepResult[] = [];
    let pressure = await dependencies.loadPressure();
    let plan = calculateCommunityObjectTombstoneSweepPlan({ ...pressure, now: now() });
    let alerted = false;
    const maxRounds = Math.max(1, Math.trunc(
      dependencies.maxRounds ?? communityObjectTombstoneMaxSweepRounds
    ));
    for (let round = 0; round < maxRounds && plan.targetLimit > 0; round += 1) {
      if (!alerted && (plan.overloaded || plan.slaAtRisk)) {
        alerted = true;
        dependencies.logger.warn({
          hotTargetCount: pressure.hotTargetCount,
          dueTargetCount: pressure.dueTargetCount,
          oldestDueAt: pressure.oldestDueAt?.toISOString() ?? null,
          capacityTargets: communityObjectTombstoneCapacityTargets,
          slaMs: communityObjectTombstoneWorstCaseSlaMs,
          estimatedProcessingMs: plan.estimatedDrainMs,
          serviceRateTargetsPerMinute: plan.serviceRateTargetsPerMinute,
          backpressure: plan.backpressure,
          slaAtRisk: plan.slaAtRisk
        }, "community object tombstone capacity alert");
      }
      const roundResults = await Promise.all(plan.shardLimits.map(async (limit, shard) => {
        if (limit <= 0) return null;
        return dependencies.reconcileShard({
          shard,
          shardCount: communityObjectTombstoneShardCount,
          limit
        });
      }));
      results.push(...roundResults.filter((result): result is CommunityObjectTombstoneSweepResult => result !== null));
      pressure = await dependencies.loadPressure();
      plan = calculateCommunityObjectTombstoneSweepPlan({ ...pressure, now: now() });
    }
    return {
      stableKeys: [...new Set(results.flatMap((result) => result.stableKeys))].sort(),
      pendingKeys: [...new Set(results.flatMap((result) => result.pendingKeys))].sort(),
      failedTargets: results.flatMap((result) => result.failedTargets),
      pressure: plan
    };
  };
}

export class CommunityObjectIoTimeoutError extends Error {
  constructor() {
    super("community_object_io_timeout");
    this.name = "CommunityObjectIoTimeoutError";
  }
}

export function createCommunityObjectIoGate({
  maxConcurrency = communityObjectIoConcurrency,
  timeoutMs = communityObjectIoTimeoutMs
}: {
  maxConcurrency?: number;
  timeoutMs?: number;
} = {}) {
  const boundedConcurrency = Math.max(1, Math.trunc(maxConcurrency));
  const boundedTimeoutMs = Math.max(1, Math.trunc(timeoutMs));
  let active = 0;
  const waiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
    signal: AbortSignal;
    onAbort: () => void;
  }> = [];

  const acquire = async (signal: AbortSignal) => {
    if (signal.aborted) throw signal.reason;
    if (active < boundedConcurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(signal.reason);
        }
      };
      waiters.push(waiter);
      signal.addEventListener("abort", waiter.onAbort, { once: true });
    });
  };
  const release = () => {
    let waiter = waiters.shift();
    while (waiter?.signal.aborted) waiter = waiters.shift();
    if (waiter) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.resolve();
      return;
    }
    active -= 1;
  };

  return {
    async run<T>(work: (signal: AbortSignal) => Promise<T>) {
      const controller = new AbortController();
      const timeoutError = new CommunityObjectIoTimeoutError();
      const timer = setTimeout(() => controller.abort(timeoutError), boundedTimeoutMs);
      timer.unref?.();
      let acquired = false;
      let releaseManagedByWork = false;
      try {
        await acquire(controller.signal);
        acquired = true;
        if (controller.signal.aborted) throw controller.signal.reason ?? timeoutError;
        const aborted = new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(controller.signal.reason ?? timeoutError), { once: true });
        });
        const workPromise = Promise.resolve().then(() => work(controller.signal));
        // Keep a late rejection handled even when the deadline wins the race.
        void workPromise.catch(() => undefined);
        // An aborted SDK request may still be completing provider-side. Keep its
        // concurrency permit until the client call actually settles.
        releaseManagedByWork = true;
        void workPromise.then(release, release);
        return await Promise.race([workPromise, aborted]);
      } finally {
        clearTimeout(timer);
        if (acquired && !releaseManagedByWork) release();
      }
    }
  };
}

export const communityObjectIoGate = createCommunityObjectIoGate();
export const communityObjectTombstoneIoGate = createCommunityObjectIoGate({
  maxConcurrency: communityObjectTombstoneDeleteConcurrency,
  timeoutMs: communityObjectTombstoneDeleteTimeoutMs
});

export type CommunityObjectTombstoneCandidate = {
  objectKey: string;
  target: CommunityObjectStorageTarget;
  generation: number;
  claimId: string;
  absenceCount: number;
  expectedTargetCount: number;
};

export interface CommunityObjectTombstoneRepository {
  claimBatch(input: {
    limit: number;
    objectKeys?: string[];
    shard?: number;
    shardCount?: number;
  }): Promise<CommunityObjectTombstoneCandidate[]>;
  markAbsent(candidate: CommunityObjectTombstoneCandidate): Promise<{ stable: boolean }>;
  release(candidate: CommunityObjectTombstoneCandidate, error: string): Promise<void>;
}

type TombstoneReconcilerDependencies = {
  repository: CommunityObjectTombstoneRepository;
  deleteTarget: (objectKey: string, target: CommunityObjectStorageTarget) => Promise<unknown>;
  concurrency?: number;
};

export function createCommunityObjectTombstoneReconciler(dependencies: TombstoneReconcilerDependencies) {
  return async function reconcileCommunityObjectTombstones({
    limit,
    objectKeys,
    shard,
    shardCount
  }: {
    limit: number;
    objectKeys?: string[];
    shard?: number;
    shardCount?: number;
  }) {
    const candidates = await dependencies.repository.claimBatch({
      limit: Math.max(1, Math.trunc(limit)),
      ...(objectKeys?.length ? { objectKeys } : {}),
      ...(shard === undefined ? {} : { shard }),
      ...(shardCount === undefined ? {} : { shardCount })
    });
    const outcomes = new Map<string, Array<{ stable: boolean; failed: boolean }>>();
    const failedTargets: Array<{ objectKey: string; target: CommunityObjectStorageTarget; error: string }> = [];
    const concurrency = Math.max(1, Math.trunc(dependencies.concurrency ?? communityObjectIoConcurrency));

    for (let offset = 0; offset < candidates.length; offset += concurrency) {
      await Promise.all(candidates.slice(offset, offset + concurrency).map(async (candidate) => {
        let stable = false;
        let failed = false;
        try {
          await dependencies.deleteTarget(candidate.objectKey, candidate.target);
          stable = (await dependencies.repository.markAbsent(candidate)).stable;
        } catch (error) {
          failed = true;
          const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
          failedTargets.push({ objectKey: candidate.objectKey, target: candidate.target, error: message });
          await dependencies.repository.release(candidate, message).catch(() => undefined);
        }
        const current = outcomes.get(candidate.objectKey) ?? [];
        current.push({ stable, failed });
        outcomes.set(candidate.objectKey, current);
      }));
    }

    const stableKeys: string[] = [];
    const pendingKeys: string[] = [];
    for (const [objectKey, targetOutcomes] of outcomes) {
      const expectedTargetCount = Math.max(
        ...candidates
          .filter((candidate) => candidate.objectKey === objectKey)
          .map((candidate) => candidate.expectedTargetCount)
      );
      if (
        targetOutcomes.length === expectedTargetCount
        && targetOutcomes.every((outcome) => outcome.stable && !outcome.failed)
      ) {
        stableKeys.push(objectKey);
      } else {
        pendingKeys.push(objectKey);
      }
    }
    stableKeys.sort();
    pendingKeys.sort();
    failedTargets.sort((left, right) => `${left.objectKey}:${left.target}`.localeCompare(`${right.objectKey}:${right.target}`));
    return { stableKeys, pendingKeys, failedTargets };
  };
}

type ObjectLifecycleDatabase = (typeof import("../db/client"))["db"];

export async function getCommunityObjectTombstonePressure(
  database: ObjectLifecycleDatabase
): Promise<CommunityObjectTombstonePressure> {
  const totals = Array.from((await database.execute(sql`
    select count(*)::integer as "hotTargetCount",
           count(*) filter (where next_reconcile_at <= clock_timestamp())::integer as "dueTargetCount",
           min(next_reconcile_at) filter (where next_reconcile_at <= clock_timestamp()) as "oldestDueAt"
    from community_object_lifecycles
    where state = 'deleted' and cold_at is null
  `)) as Iterable<{ hotTargetCount: number; dueTargetCount: number; oldestDueAt: Date | null }>);
  const shards = Array.from((await database.execute(sql`
    select mod(hashtext(object_key)::bigint + 2147483648, ${communityObjectTombstoneShardCount})::integer as shard,
           count(*)::integer as count
    from community_object_lifecycles
    where state = 'deleted' and cold_at is null
      and next_reconcile_at <= clock_timestamp()
    group by shard
  `)) as Iterable<{ shard: number; count: number }>);
  const dueByShard = Array(communityObjectTombstoneShardCount).fill(0) as number[];
  for (const shard of shards) {
    if (shard.shard >= 0 && shard.shard < communityObjectTombstoneShardCount) {
      dueByShard[shard.shard] = shard.count;
    }
  }
  return {
    hotTargetCount: totals[0]?.hotTargetCount ?? 0,
    dueTargetCount: totals[0]?.dueTargetCount ?? 0,
    dueByShard,
    oldestDueAt: totals[0]?.oldestDueAt ?? null
  };
}

export async function assertCommunityObjectPublicationCapacity(database: ObjectLifecycleDatabase) {
  const gate = createCommunityObjectPublicationCapacityGate(() => getCommunityObjectTombstonePressure(database));
  try {
    await gate();
  } catch (error) {
    if (error instanceof CommunityObjectReconciliationBackpressureError) {
      communityObjectTombstoneMetrics.recordBackpressure();
    }
    throw error;
  }
}

function uniqueObjectKeys(objectKeys: string[]) {
  return [...new Set(objectKeys.filter(Boolean))].sort();
}

function uniqueTargets(targets: CommunityObjectStorageTarget[]) {
  return [...new Set(targets)].sort() as CommunityObjectStorageTarget[];
}

export async function ensureCommunityObjectTombstoneTargetsInDatabase(
  targets: CommunityObjectStorageTarget[],
  database: ObjectLifecycleDatabase
) {
  const configuredTargets = uniqueTargets(targets);
  if (!configuredTargets.length) return;
  await database.execute(sql`
    insert into community_object_lifecycles (
      object_key, target, generation, state, publication_token, tombstoned_at,
      hot_until, cold_at, absence_count, absent_since, verified_at, next_reconcile_at,
      claim_id, claimed_at, last_error, created_at, updated_at
    )
    select tombstone.object_key, configured.target, tombstone.generation, 'deleted', null,
           tombstone.tombstoned_at, clock_timestamp(), null, 0, null, null, clock_timestamp(),
           null, null, null, clock_timestamp(), clock_timestamp()
    from (
      select object_key, max(generation) as generation, min(tombstoned_at) as tombstoned_at
      from community_object_lifecycles
      where state = 'deleted'
      group by object_key
    ) tombstone
    cross join (values ${sql.join(
      configuredTargets.map((target) => sql`(${target}::varchar(16))`),
      sql`, `
    )}) configured(target)
    on conflict (object_key, target) do nothing
  `);
}

let ensuredTombstoneTargetSet: string | undefined;
let tombstoneTargetBackfill: Promise<void> | undefined;

async function ensureConfiguredCommunityObjectTombstoneTargets(
  targets: CommunityObjectStorageTarget[],
  database: ObjectLifecycleDatabase
) {
  const targetSet = uniqueTargets(targets).join(",");
  while (ensuredTombstoneTargetSet !== targetSet) {
    if (tombstoneTargetBackfill) {
      await tombstoneTargetBackfill;
      continue;
    }
    const current = ensureCommunityObjectTombstoneTargetsInDatabase(targets, database);
    tombstoneTargetBackfill = current;
    try {
      await current;
      ensuredTombstoneTargetSet = targetSet;
    } finally {
      if (tombstoneTargetBackfill === current) tombstoneTargetBackfill = undefined;
    }
  }
}

export async function tombstoneCommunityObjectKeysInDatabase(
  objectKeys: string[],
  targets: CommunityObjectStorageTarget[],
  database: ObjectLifecycleDatabase
) {
  const keys = uniqueObjectKeys(objectKeys);
  if (!keys.length) return;
  const configuredTargets = uniqueTargets(targets);
  if (!configuredTargets.length) throw new Error("community_object_storage_targets_required");

  await database.execute(sql`
    update community_object_lifecycles lifecycle
    set generation = lifecycle.generation + 1,
        state = 'deleted', publication_token = null,
        tombstoned_at = coalesce(lifecycle.tombstoned_at, clock_timestamp()),
        hot_until = greatest(coalesce(lifecycle.hot_until, clock_timestamp()),
          clock_timestamp() + (${communityObjectProviderUncertaintyMs} * interval '1 millisecond')),
        cold_at = null,
        absence_count = 0, absent_since = null, verified_at = null,
        next_reconcile_at = least(lifecycle.next_reconcile_at, clock_timestamp()),
        claim_id = null, claimed_at = null, last_error = null, updated_at = clock_timestamp()
    where lifecycle.object_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
      and lifecycle.target not in (${sql.join(configuredTargets.map((target) => sql`${target}`), sql`, `)})
  `);

  const pairs = keys.flatMap((objectKey) => configuredTargets.map((target) => ({ objectKey, target })));
  if (pairs.length) {
    await database.execute(sql`
      insert into community_object_lifecycles (
        object_key, target, generation, state, publication_token, tombstoned_at,
        hot_until, cold_at, absence_count, next_reconcile_at, updated_at
      ) values ${sql.join(pairs.map((pair) => sql`(
        ${pair.objectKey}, ${pair.target}, 1, 'deleted', null, clock_timestamp(),
        clock_timestamp() + (${communityObjectProviderUncertaintyMs} * interval '1 millisecond'),
        null, 0, clock_timestamp(), clock_timestamp()
      )`), sql`, `)}
      on conflict (object_key, target) do update
      set generation = community_object_lifecycles.generation + 1,
          state = 'deleted', publication_token = null,
          tombstoned_at = coalesce(community_object_lifecycles.tombstoned_at, clock_timestamp()),
          hot_until = greatest(coalesce(community_object_lifecycles.hot_until, clock_timestamp()),
            clock_timestamp() + (${communityObjectProviderUncertaintyMs} * interval '1 millisecond')),
          cold_at = null,
          absence_count = 0, absent_since = null, verified_at = null,
          next_reconcile_at = least(community_object_lifecycles.next_reconcile_at, clock_timestamp()),
          claim_id = null, claimed_at = null, last_error = null, updated_at = clock_timestamp()
    `);
  }

  await database.execute(sql`
    delete from community_object_publications
    where object_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
  `);
}

export async function tombstoneCommunityObjectKeys(
  objectKeys: string[],
  database?: ObjectLifecycleDatabase
) {
  const keys = uniqueObjectKeys(objectKeys);
  if (!keys.length) return;
  const [{ db }, storage] = await Promise.all([
    import("../db/client"),
    import("../storage/s3")
  ]);
  const activeDatabase = database ?? db;
  const targets = await storage.getConfiguredS3Targets();
  await activeDatabase.transaction(async (transaction) => {
    await tombstoneCommunityObjectKeysInDatabase(
      keys,
      targets,
      transaction as unknown as ObjectLifecycleDatabase
    );
  });
}

export function createCommunityObjectTombstoneRepository(
  database: ObjectLifecycleDatabase
): CommunityObjectTombstoneRepository {
  return {
    async claimBatch({ limit, objectKeys, shard, shardCount }) {
      const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), communityObjectTombstoneCapacityTargets);
      const keys = uniqueObjectKeys(objectKeys ?? []);
      const boundedShardCount = Math.max(1, Math.trunc(shardCount ?? communityObjectTombstoneShardCount));
      const boundedShard = Math.min(Math.max(0, Math.trunc(shard ?? 0)), boundedShardCount - 1);
      return Array.from((await database.execute(sql`
        with candidates as (
          select object_key, target
          from community_object_lifecycles
          where state = 'deleted'
            and cold_at is null
            and (${keys.length
              ? sql`object_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})`
              : sql`next_reconcile_at <= clock_timestamp()`})
            and (${shard === undefined
              ? sql`true`
              : sql`mod(hashtext(object_key)::bigint + 2147483648, ${boundedShardCount}) = ${boundedShard}`})
            and (claim_id is null or claimed_at <= clock_timestamp()
              - (${communityObjectTombstoneClaimStaleMs} * interval '1 millisecond'))
          order by next_reconcile_at, object_key, target
          limit ${boundedLimit}
          for update skip locked
        )
        update community_object_lifecycles lifecycle
        set claim_id = gen_random_uuid(), claimed_at = clock_timestamp(), updated_at = clock_timestamp()
        from candidates
        where lifecycle.object_key = candidates.object_key and lifecycle.target = candidates.target
        returning lifecycle.object_key as "objectKey", lifecycle.target,
                  lifecycle.generation, lifecycle.claim_id as "claimId",
                  lifecycle.absence_count as "absenceCount",
                  (select count(*)::integer
                   from community_object_lifecycles expected
                   where expected.object_key = lifecycle.object_key
                     and expected.state = 'deleted' and expected.cold_at is null) as "expectedTargetCount"
      `)) as Iterable<CommunityObjectTombstoneCandidate>);
    },

    async markAbsent(candidate) {
      const rows = Array.from((await database.execute(sql`
        with updated as (
          update community_object_lifecycles lifecycle
          set absence_count = case
                when lifecycle.verified_at is null
                  or lifecycle.verified_at <= clock_timestamp()
                    - (${communityObjectAbsenceStableMs} * interval '1 millisecond')
                then least(lifecycle.absence_count + 1, 2)
                else lifecycle.absence_count
              end,
              absent_since = case
                when lifecycle.verified_at is null
                  or lifecycle.verified_at <= clock_timestamp()
                    - (${communityObjectAbsenceStableMs} * interval '1 millisecond')
                then coalesce(lifecycle.absent_since, clock_timestamp())
                else lifecycle.absent_since
              end,
              verified_at = case
                when lifecycle.verified_at is null
                  or lifecycle.verified_at <= clock_timestamp()
                    - (${communityObjectAbsenceStableMs} * interval '1 millisecond')
                then clock_timestamp()
                else lifecycle.verified_at
              end,
              claim_id = null, claimed_at = null, last_error = null,
              updated_at = clock_timestamp()
          where lifecycle.object_key = ${candidate.objectKey}
            and lifecycle.target = ${candidate.target}
            and lifecycle.generation = ${candidate.generation}
            and lifecycle.state = 'deleted'
            and lifecycle.claim_id = ${candidate.claimId}
          returning lifecycle.absence_count
        )
        update community_object_lifecycles lifecycle
        set cold_at = case
              when updated.absence_count >= 2
                and coalesce(lifecycle.hot_until, clock_timestamp()) <= clock_timestamp()
              then clock_timestamp()
              else null
            end,
            next_reconcile_at = case
              when updated.absence_count >= 2
                and coalesce(lifecycle.hot_until, clock_timestamp()) <= clock_timestamp()
              then clock_timestamp()
              when updated.absence_count < 2
              then clock_timestamp() + (${communityObjectAbsenceStableMs} * interval '1 millisecond')
              else least(
                clock_timestamp() + (${communityObjectTombstoneAuditMs} * interval '1 millisecond'),
                coalesce(lifecycle.hot_until,
                  clock_timestamp() + (${communityObjectTombstoneAuditMs} * interval '1 millisecond'))
              )
            end
        from updated
        where lifecycle.object_key = ${candidate.objectKey}
          and lifecycle.target = ${candidate.target}
        returning updated.absence_count as "absenceCount"
      `)) as Iterable<{ absenceCount: number }>);
      if (!rows[0]) throw new Error("community_object_tombstone_claim_lost");
      return { stable: rows[0].absenceCount >= 2 };
    },

    async release(candidate, error) {
      await database.execute(sql`
        update community_object_lifecycles
        set claim_id = null, claimed_at = null, absence_count = 0, absent_since = null,
            verified_at = null, cold_at = null,
            hot_until = coalesce(hot_until,
              clock_timestamp() + (${communityObjectProviderUncertaintyMs} * interval '1 millisecond')),
            last_error = ${error.slice(0, 500)},
            next_reconcile_at = clock_timestamp() + (${communityObjectAbsenceStableMs} * interval '1 millisecond'),
            updated_at = clock_timestamp()
        where object_key = ${candidate.objectKey} and target = ${candidate.target}
          and generation = ${candidate.generation} and state = 'deleted'
          and claim_id = ${candidate.claimId}
      `);
    }
  };
}

export class CommunityObjectCleanupPendingError extends Error {
  constructor() {
    super("community_object_cleanup_pending");
    this.name = "CommunityObjectCleanupPendingError";
  }
}

type TombstoneReconcileResult = {
  stableKeys: string[];
  pendingKeys: string[];
  failedTargets: Array<unknown>;
};

export function createCommunityObjectConvergentDeletion(dependencies: {
  tombstone: (objectKeys: string[]) => Promise<void>;
  reconcile: (objectKeys: string[]) => Promise<TombstoneReconcileResult>;
  wait?: (milliseconds: number) => Promise<void>;
  stableGapMs?: number;
  maxPasses?: number;
}) {
  const wait = dependencies.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const stableGapMs = Math.max(1, Math.trunc(dependencies.stableGapMs ?? communityObjectAbsenceStableMs));
  const maxPasses = Math.max(2, Math.trunc(dependencies.maxPasses ?? 3));
  return async function deleteConvergently(objectKeys: string[]) {
    const keys = uniqueObjectKeys(objectKeys);
    if (!keys.length) return;
    await dependencies.tombstone(keys);
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const result = await dependencies.reconcile(keys);
      if (!result.failedTargets.length && keys.every((key) => result.stableKeys.includes(key))) return;
      if (pass + 1 < maxPasses) await wait(stableGapMs);
    }
    throw new CommunityObjectCleanupPendingError();
  };
}

export async function reconcileCommunityObjectTombstones(input: {
  limit?: number;
  objectKeys?: string[];
  shard?: number;
  shardCount?: number;
} = {}) {
  const [{ db }, storage] = await Promise.all([
    import("../db/client"),
    import("../storage/s3")
  ]);
  const targets = await storage.getConfiguredS3Targets();
  await ensureConfiguredCommunityObjectTombstoneTargets(targets, db);
  const reconciler = createCommunityObjectTombstoneReconciler({
    repository: createCommunityObjectTombstoneRepository(db),
    deleteTarget: async (objectKey, target) => {
      if (!(await storage.isS3TargetConfigured(target))) {
        throw new Error(`${target === "reserve" ? "Reserve" : "Primary"} S3 storage is not configured`);
      }
      await communityObjectTombstoneIoGate.run((signal) => storage.deleteObject(objectKey, target, signal));
    },
    concurrency: communityObjectTombstoneDeleteConcurrency
  });
  return reconciler({
    limit: input.limit ?? communityObjectTombstoneBatchSize * 2,
    ...(input.objectKeys?.length ? { objectKeys: uniqueObjectKeys(input.objectKeys) } : {}),
    ...(input.shard === undefined ? {} : { shard: input.shard }),
    ...(input.shardCount === undefined ? {} : { shardCount: input.shardCount })
  });
}

export const deleteCommunityObjectKeysConvergently = createCommunityObjectConvergentDeletion({
  tombstone: tombstoneCommunityObjectKeys,
  reconcile: (objectKeys) => reconcileCommunityObjectTombstones({
    objectKeys,
    limit: objectKeys.length * 2
  })
});

export async function deleteCommunityObjectCopiesConvergently(objectKey: string) {
  return deleteCommunityObjectKeysConvergently([objectKey]);
}

export async function runCommunityObjectTombstoneSweepBatch() {
  const [{ db }, storage, { logger }] = await Promise.all([
    import("../db/client"),
    import("../storage/s3"),
    import("../logger")
  ]);
  await ensureConfiguredCommunityObjectTombstoneTargets(await storage.getConfiguredS3Targets(), db);
  const result = await createCommunityObjectTombstoneSweep({
    loadPressure: () => getCommunityObjectTombstonePressure(db),
    reconcileShard: ({ shard, shardCount, limit }) => reconcileCommunityObjectTombstones({
      shard,
      shardCount,
      limit
    }),
    logger
  })();
  communityObjectTombstoneMetrics.recordSweep(await getCommunityObjectTombstonePressure(db), result.pressure);
  return result;
}
