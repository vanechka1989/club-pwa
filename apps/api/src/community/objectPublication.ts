import { sql } from "drizzle-orm";
import {
  communityObjectIoGate,
  type CommunityObjectStorageTarget
} from "./objectLifecycle";

export type CommunityObjectPublicationClaim = {
  id: string;
  publicationToken: string;
  sourceType: "attachment" | "candidate" | "manifest";
  sourceId: string;
  objectKey: string;
};

type PublicationDatabase = (typeof import("../db/client"))["db"];

type PublicationCoordinatorDependencies<Database> = {
  assertActive: (claim: CommunityObjectPublicationClaim) => Promise<void>;
  runIo: <T>(work: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  commitPublication: <T>(
    claim: CommunityObjectPublicationClaim,
    work: (database: Database) => Promise<T>
  ) => Promise<T>;
};

export function createCommunityObjectPublicationCoordinator<Database>(
  dependencies: PublicationCoordinatorDependencies<Database>
) {
  return async function coordinateCommunityObjectPublication<Written, Result>({
    claim,
    write,
    commit
  }: {
    claim: CommunityObjectPublicationClaim;
    write: (signal: AbortSignal) => Promise<Written>;
    commit: (database: Database, written: Written) => Promise<Result>;
  }) {
    await dependencies.assertActive(claim);
    const written = await dependencies.runIo(write);
    return dependencies.commitPublication(claim, (database) => commit(database, written));
  };
}

export async function beginCommunityObjectPublication(
  input: Pick<CommunityObjectPublicationClaim, "sourceType" | "sourceId" | "objectKey"> & {
    targets: CommunityObjectStorageTarget[];
  },
  database?: PublicationDatabase
): Promise<CommunityObjectPublicationClaim> {
  const activeDatabase = database ?? (await import("../db/client")).db;
  const targets = [...new Set(input.targets)];
  if (!targets.length) throw new Error("community_object_storage_targets_required");
  return activeDatabase.transaction(async (transaction) => {
    const transactionalDatabase = transaction as unknown as PublicationDatabase;
    const rows = Array.from((await transactionalDatabase.execute(sql`
      insert into community_object_publications (
        source_type, source_id, object_key, publication_token, state, quiesced_at, updated_at
      ) values (
        ${input.sourceType}, ${input.sourceId}, ${input.objectKey}, gen_random_uuid(),
        'publishing', null, clock_timestamp()
      )
      on conflict (source_type, source_id, object_key) do update
      set publication_token = gen_random_uuid(), state = 'publishing', quiesced_at = null,
          updated_at = clock_timestamp()
      where community_object_publications.state = 'publishing'
      returning id, publication_token as "publicationToken"
    `)) as Iterable<{ id: string; publicationToken: string }>);
    const claim = rows[0];
    if (!claim) throw new Error("object_publication_not_reserved");

    const lifecycleRows = Array.from((await transactionalDatabase.execute(sql`
      insert into community_object_lifecycles (
        object_key, target, generation, state, publication_token,
        absence_count, absent_since, verified_at, next_reconcile_at, updated_at
      ) values ${sql.join(targets.map((target) => sql`(
        ${input.objectKey}, ${target}, 1, 'publishing', ${claim.publicationToken},
        0, null, null, clock_timestamp(), clock_timestamp()
      )`), sql`, `)}
      on conflict (object_key, target) do update
      set generation = community_object_lifecycles.generation + 1,
          state = 'publishing', publication_token = ${claim.publicationToken},
          absence_count = 0, absent_since = null, verified_at = null,
          next_reconcile_at = clock_timestamp(), claim_id = null, claimed_at = null,
          last_error = null, updated_at = clock_timestamp()
      where community_object_lifecycles.state <> 'deleted'
      returning target
    `)) as Iterable<{ target: CommunityObjectStorageTarget }>);
    if (lifecycleRows.length !== targets.length) throw new Error("object_publication_tombstoned");
    return {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      objectKey: input.objectKey,
      ...claim
    };
  });
}

export async function assertCommunityObjectPublicationActive(
  claim: CommunityObjectPublicationClaim,
  database?: PublicationDatabase
) {
  const activeDatabase = database ?? (await import("../db/client")).db;
  const rows = Array.from((await activeDatabase.execute(sql`
    select publication.id
    from community_object_publications publication
    where publication.id = ${claim.id}
      and publication.publication_token = ${claim.publicationToken}
      and publication.state = 'publishing'
      and exists (
        select 1 from community_object_lifecycles lifecycle
        where lifecycle.object_key = publication.object_key
          and lifecycle.state = 'publishing'
          and lifecycle.publication_token = publication.publication_token
      )
    limit 1
  `)) as Iterable<{ id: string }>);
  if (!rows.length) throw new Error("object_publication_claim_lost");
}

export async function commitCommunityObjectPublication<T>(
  claim: CommunityObjectPublicationClaim,
  work: (transaction: PublicationDatabase) => Promise<T>,
  database?: PublicationDatabase
) {
  const activeDatabase = database ?? (await import("../db/client")).db;
  return activeDatabase.transaction(async (transaction) => {
    const transactionalDatabase = transaction as unknown as PublicationDatabase;
    const rows = Array.from((await transactionalDatabase.execute(sql`
      select id
      from community_object_publications
      where id = ${claim.id}
        and publication_token = ${claim.publicationToken}
        and state = 'publishing'
      for update
    `)) as Iterable<{ id: string }>);
    if (!rows.length) throw new Error("object_publication_claim_lost");
    const lifecycleRows = Array.from((await transactionalDatabase.execute(sql`
      select target
      from community_object_lifecycles
      where object_key = ${claim.objectKey}
        and state = 'publishing'
        and publication_token = ${claim.publicationToken}
      for update
    `)) as Iterable<{ target: CommunityObjectStorageTarget }>);
    if (!lifecycleRows.length) throw new Error("object_publication_claim_lost");

    const result = await work(transactionalDatabase);
    const committed = Array.from((await transactionalDatabase.execute(sql`
      update community_object_lifecycles
      set state = 'present', publication_token = null, updated_at = clock_timestamp()
      where object_key = ${claim.objectKey}
        and state = 'publishing'
        and publication_token = ${claim.publicationToken}
      returning target
    `)) as Iterable<{ target: CommunityObjectStorageTarget }>);
    if (committed.length !== lifecycleRows.length) throw new Error("object_publication_claim_lost");
    const deleted = Array.from((await transactionalDatabase.execute(sql`
      delete from community_object_publications
      where id = ${claim.id}
        and publication_token = ${claim.publicationToken}
        and state = 'publishing'
      returning id
    `)) as Iterable<{ id: string }>);
    if (deleted.length !== 1) throw new Error("object_publication_claim_lost");
    return result;
  });
}

export const publishCommunityObject = createCommunityObjectPublicationCoordinator<PublicationDatabase>({
  assertActive: (claim) => assertCommunityObjectPublicationActive(claim),
  runIo: (work) => communityObjectIoGate.run(work),
  commitPublication: (claim, work) => commitCommunityObjectPublication(claim, work)
});
