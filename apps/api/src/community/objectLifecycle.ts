import { sql } from "drizzle-orm";

export const communityObjectIoConcurrency = 4;
export const communityObjectIoTimeoutMs = 2 * 60_000;
export const communityObjectAbsenceStableMs = 1_000;
export const communityObjectTombstoneAuditMs = 5 * 60_000;
export const communityObjectTombstoneClaimStaleMs = 5 * 60_000;
export const communityObjectTombstoneBatchSize = 100;

export type CommunityObjectStorageTarget = "primary" | "reserve";

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

export type CommunityObjectTombstoneCandidate = {
  objectKey: string;
  target: CommunityObjectStorageTarget;
  generation: number;
  claimId: string;
  absenceCount: number;
  expectedTargetCount: number;
};

export interface CommunityObjectTombstoneRepository {
  claimBatch(input: { limit: number; objectKeys?: string[] }): Promise<CommunityObjectTombstoneCandidate[]>;
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
    objectKeys
  }: {
    limit: number;
    objectKeys?: string[];
  }) {
    const candidates = await dependencies.repository.claimBatch({
      limit: Math.max(1, Math.trunc(limit)),
      ...(objectKeys?.length ? { objectKeys } : {})
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
      absence_count, absent_since, verified_at, next_reconcile_at,
      claim_id, claimed_at, last_error, created_at, updated_at
    )
    select tombstone.object_key, configured.target, tombstone.generation, 'deleted', null,
           tombstone.tombstoned_at, 0, null, null, clock_timestamp(),
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
        absence_count, next_reconcile_at, updated_at
      ) values ${sql.join(pairs.map((pair) => sql`(
        ${pair.objectKey}, ${pair.target}, 1, 'deleted', null, clock_timestamp(),
        0, clock_timestamp(), clock_timestamp()
      )`), sql`, `)}
      on conflict (object_key, target) do update
      set generation = community_object_lifecycles.generation + 1,
          state = 'deleted', publication_token = null,
          tombstoned_at = coalesce(community_object_lifecycles.tombstoned_at, clock_timestamp()),
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
    async claimBatch({ limit, objectKeys }) {
      const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), communityObjectTombstoneBatchSize * 2);
      const keys = uniqueObjectKeys(objectKeys ?? []);
      return Array.from((await database.execute(sql`
        with candidates as (
          select object_key, target
          from community_object_lifecycles
          where state = 'deleted'
            and (${keys.length
              ? sql`object_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})`
              : sql`next_reconcile_at <= clock_timestamp()`})
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
                     and expected.state = 'deleted') as "expectedTargetCount"
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
        set next_reconcile_at = clock_timestamp() + (
              case when updated.absence_count >= 2
                then ${communityObjectTombstoneAuditMs}
                else ${communityObjectAbsenceStableMs}
              end * interval '1 millisecond'
            )
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
            verified_at = null, last_error = ${error.slice(0, 500)},
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
      await communityObjectIoGate.run((signal) => storage.deleteObject(objectKey, target, signal));
    },
    concurrency: communityObjectIoConcurrency
  });
  return reconciler({
    limit: input.limit ?? communityObjectTombstoneBatchSize * 2,
    ...(input.objectKeys?.length ? { objectKeys: uniqueObjectKeys(input.objectKeys) } : {})
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

export async function runCommunityObjectTombstoneSweepBatch(limit = communityObjectTombstoneBatchSize) {
  return reconcileCommunityObjectTombstones({ limit: Math.max(1, Math.trunc(limit)) * 2 });
}
