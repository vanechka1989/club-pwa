import { describe, expect, it } from "vitest";
import {
  createCommunityObjectPublicationCoordinator,
  type CommunityObjectPublicationClaim
} from "./objectPublication";

const claim: CommunityObjectPublicationClaim = {
  id: "00000000-0000-4000-8000-000000000801",
  publicationToken: "00000000-0000-4000-8000-000000000802",
  sourceType: "candidate",
  sourceId: "00000000-0000-4000-8000-000000000803",
  objectKey: "community/final/outside-transaction.webp"
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
});
