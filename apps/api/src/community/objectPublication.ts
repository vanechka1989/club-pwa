import { sql } from "drizzle-orm";

export type CommunityObjectPublicationClaim = {
  id: string;
  publicationToken: string;
  sourceType: "candidate" | "manifest";
  sourceId: string;
  objectKey: string;
};

type PublicationDatabase = (typeof import("../db/client"))["db"];

export async function beginCommunityObjectPublication(
  input: Pick<CommunityObjectPublicationClaim, "sourceType" | "sourceId" | "objectKey">,
  database?: PublicationDatabase
): Promise<CommunityObjectPublicationClaim> {
  const activeDatabase = database ?? (await import("../db/client")).db;
  const rows = Array.from((await activeDatabase.execute(sql`
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
  return { ...input, ...claim };
}

export async function withCommunityObjectPublication<T>(
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

    const result = await work(transactionalDatabase);
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
