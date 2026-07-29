import { describe, expect, it } from "vitest";
import {
  createCommunityObjectPublicationGroupCoordinator,
  createCommunityObjectPublicationCoordinator,
  type CommunityObjectPublicationClaim
} from "./objectPublication";

const claim: CommunityObjectPublicationClaim = {
  id: "00000000-0000-4000-8000-000000000801",
  publicationToken: "00000000-0000-4000-8000-000000000802",
  sourceType: "candidate",
  sourceId: "00000000-0000-4000-8000-000000000803",
  objectKey: "community/final/outside-transaction.webp",
  targets: ["primary", "reserve"]
};

describe("community object publication coordinator", () => {
  it("performs bounded storage I/O between two short database phases", async () => {
    let databaseTransactionActive = false;
    const events: string[] = [];
    const coordinator = createCommunityObjectPublicationCoordinator({
      assertActive: async () => {
        databaseTransactionActive = true;
        events.push("db:assert");
        databaseTransactionActive = false;
      },
      runIo: async (work) => {
        events.push("io:permit");
        return work(new AbortController().signal);
      },
      commitPublication: async (_claim, work) => {
        databaseTransactionActive = true;
        events.push("db:commit");
        const result = await work({ transaction: true });
        databaseTransactionActive = false;
        return result;
      }
    });

    const result = await coordinator({
      claim,
      write: async (signal) => {
        expect(signal.aborted).toBe(false);
        expect(databaseTransactionActive).toBe(false);
        events.push("s3:write");
        return { etag: "immutable" };
      },
      commit: async (database, written) => {
        expect(databaseTransactionActive).toBe(true);
        expect(database).toEqual({ transaction: true });
        expect(written).toEqual({ etag: "immutable" });
        events.push("db:source");
        return "published" as const;
      }
    });

    expect(result).toBe("published");
    expect(events).toEqual(["db:assert", "io:permit", "s3:write", "db:commit", "db:source"]);
  });

  it("writes every gallery object before one atomic publication commit", async () => {
    const events: string[] = [];
    const secondClaim: CommunityObjectPublicationClaim = {
      ...claim,
      id: "00000000-0000-4000-8000-000000000811",
      publicationToken: "00000000-0000-4000-8000-000000000812",
      sourceId: "00000000-0000-4000-8000-000000000813",
      objectKey: "community/final/gallery-2.webp"
    };
    const commitPublications = async <T>(
      claims: CommunityObjectPublicationClaim[],
      work: (database: { transaction: true }) => Promise<T>
    ) => {
      events.push(`db:commit:${claims.length}`);
      return work({ transaction: true });
    };
    const coordinator = createCommunityObjectPublicationGroupCoordinator({
      assertActive: async (publication) => { events.push(`db:assert:${publication.sourceId}`); },
      runIo: async (work) => work(new AbortController().signal),
      commitPublications
    });

    const result = await coordinator({
      publications: [
        { claim, write: async () => { events.push("s3:write:1"); return "etag-1"; } },
        { claim: secondClaim, write: async () => { events.push("s3:write:2"); return "etag-2"; } }
      ],
      commit: async (database, written) => {
        expect(database).toEqual({ transaction: true });
        expect(written).toEqual(["etag-1", "etag-2"]);
        events.push("db:attachments-ready");
        return "gallery-ready" as const;
      }
    });

    expect(result).toBe("gallery-ready");
    expect(events.slice(-2)).toEqual(["db:commit:2", "db:attachments-ready"]);
    expect(events.indexOf("db:commit:2")).toBeGreaterThan(events.indexOf("s3:write:1"));
    expect(events.indexOf("db:commit:2")).toBeGreaterThan(events.indexOf("s3:write:2"));
  });

  it("does not commit a partially written gallery", async () => {
    const commitPublications = async () => { throw new Error("must_not_commit"); };
    const coordinator = createCommunityObjectPublicationGroupCoordinator({
      assertActive: async () => undefined,
      runIo: async (work) => work(new AbortController().signal),
      commitPublications
    });

    await expect(coordinator({
      publications: [
        { claim, write: async () => "etag-1" },
        { claim: { ...claim, id: "second", sourceId: "second", objectKey: "second" }, write: async () => { throw new Error("s3_failed"); } }
      ],
      commit: async () => "ready"
    })).rejects.toThrow("s3_failed");
  });
});
