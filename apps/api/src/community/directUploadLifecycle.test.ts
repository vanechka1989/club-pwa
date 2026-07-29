import type { CommunityUploadedObject } from "@club/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildCommunityFinalObjectKey,
  createCommunityUploadService,
  validateListedMultipartParts
} from "./directUpload";
import { cleanupUnattachedCommunityUpload, createCommunityUploadSessionService } from "./uploadSessions";

const MiB = 1024 * 1024;
const userId = "11111111-1111-4111-8111-111111111111";
const uploadToken = "33333333-3333-4333-8333-333333333333";
const stagingKey = `community/pending/${userId}/2026-07-29/${uploadToken}-clip.mp4`;

function uploaded(overrides: Partial<CommunityUploadedObject> = {}): CommunityUploadedObject {
  return {
    kind: "video",
    fileName: "clip.mp4",
    contentType: "video/mp4",
    sizeBytes: 1024,
    uploadToken,
    objectKey: stagingKey,
    ...overrides
  } as CommunityUploadedObject;
}

function serviceDependencies(overrides: Record<string, unknown> = {}) {
  return {
    issue: async () => undefined,
    claim: async () => ({
      ok: true,
      intent: {
        stagingObjectKey: stagingKey,
        uploadType: "put",
        multipartUploadId: null,
        expectedPartCount: null,
        partSizeBytes: null
      }
    }),
    finish: async () => "finished" as const,
    fail: async () => undefined,
    createPutUrl: async ({ key }: { key: string }) => ({ key, uploadUrl: "https://s3.test/put", expiresAt: new Date("2026-07-29T12:10:00.000Z") }),
    createMultipart: async () => { throw new Error("unused"); },
    createPartUrl: async () => { throw new Error("unused"); },
    completeMultipart: async () => { throw new Error("unused"); },
    abortMultipart: async () => undefined,
    listParts: async () => [],
    getMetadata: async (key: string) => ({ key, contentType: "video/mp4", sizeBytes: 1024, etag: '"clean-etag"' }),
    getLeadingBytes: async () => new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    validateOoxml: async () => true,
    recordPromotion: async ({ destinationKey }: { destinationKey: string }) => ({
      status: "recorded" as const,
      publication: {
        id: "00000000-0000-4000-8000-000000000001",
        publicationToken: "00000000-0000-4000-8000-000000000002",
        sourceType: "manifest" as const,
        sourceId: "00000000-0000-4000-8000-000000000003",
        objectKey: destinationKey
      }
    }),
    publishPromotion: async (_publication: unknown, work: {
      write: (signal: AbortSignal) => Promise<unknown>;
      commit: (scope: unknown, written: unknown) => Promise<unknown>;
    }) => {
      const written = await work.write(new AbortController().signal);
      return work.commit(undefined, written);
    },
    promoteObject: async () => undefined,
    mirrorToReserve: async () => undefined,
    deleteCopies: async () => undefined,
    deleteStaging: async () => undefined,
    markCleanupPending: async () => undefined,
    completeCancelledCleanup: async () => undefined,
    ...overrides
  } as any;
}

describe("community direct upload immutable lifecycle", () => {
  it("promotes the verified ETag to a different immutable key and never returns the reusable staging key", async () => {
    const promoted = new Map<string, string>();
    let stagingBytes = "verified-video";
    const finish = vi.fn(async () => "finished" as const);
    const service = createCommunityUploadService(serviceDependencies({
      promoteObject: async ({ destinationKey, expectedETag }: { destinationKey: string; expectedETag: string }) => {
        expect(expectedETag).toBe('"clean-etag"');
        promoted.set(destinationKey, stagingBytes);
      },
      finish,
      deleteStaging: async () => undefined
    }));

    const result = await service.completePut({ userId, uploaded: uploaded(), now: new Date("2026-07-29T12:05:00.000Z") });
    stagingBytes = "malicious-reuse";

    expect(result.objectKey).toMatch(/^community\/final\//);
    expect(result.objectKey).not.toBe(stagingKey);
    expect(promoted.get(result.objectKey)).toBe("verified-video");
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ objectKey: result.objectKey, scanStatus: "ready" }) }),
      undefined
    );
  });

  it("uses a private quarantine key for documents and queues durable scanning state", async () => {
    const finish = vi.fn(async () => "finished" as const);
    const service = createCommunityUploadService(serviceDependencies({
      getMetadata: async (key: string) => ({ key, contentType: "application/pdf", sizeBytes: 8, etag: '"pdf-etag"' }),
      getLeadingBytes: async () => new TextEncoder().encode("%PDF-1.7"),
      finish
    }));
    const result = await service.completePut({
      userId,
      uploaded: uploaded({ kind: "document", fileName: "guide.pdf", contentType: "application/pdf", sizeBytes: 8 }),
      now: new Date("2026-07-29T12:05:00.000Z")
    });

    expect(result.objectKey).toMatch(/^community\/quarantine\//);
    expect(result.scanStatus).toBe("pending");
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }), undefined);
  });

  it("returns the durable authoritative result for an identical completion replay", async () => {
    const metadata = vi.fn();
    const replay = { ...uploaded({ objectKey: buildCommunityFinalObjectKey({ userId, uploadToken, fileName: "clip.mp4" }) }), scanStatus: "ready" as const };
    const service = createCommunityUploadService(serviceDependencies({
      claim: async () => ({ ok: true, replay }),
      getMetadata: metadata
    }));

    await expect(service.completePut({ userId, uploaded: uploaded() })).resolves.toEqual(replay);
    expect(metadata).not.toHaveBeenCalled();
  });

  it("ledgers the promoted destination before an uncertain durable finish so abort can reclaim it", async () => {
    let finalObjectKey: string | null = null;
    const objects = new Set([stagingKey]);
    const deleteCopies = vi.fn(async () => undefined);
    const deleteStaging = vi.fn(async () => undefined);
    const fail = vi.fn(async () => undefined);
    const service = createCommunityUploadService(serviceDependencies({
      recordPromotion: async ({ destinationKey }: { destinationKey: string }) => {
        finalObjectKey = destinationKey;
        return {
          status: "recorded" as const,
          publication: {
            id: "00000000-0000-4000-8000-000000000001",
            publicationToken: "00000000-0000-4000-8000-000000000002",
            sourceType: "manifest" as const,
            sourceId: "00000000-0000-4000-8000-000000000003",
            objectKey: destinationKey
          }
        };
      },
      promoteObject: async ({ destinationKey }: { destinationKey: string }) => { objects.add(destinationKey); },
      finish: async () => { throw new Error("database_timeout"); },
      deleteCopies,
      deleteStaging,
      fail
    }));

    await expect(service.completePut({ userId, uploaded: uploaded() })).rejects.toThrow("database_timeout");
    expect(finalObjectKey).toMatch(/^community\/final\//);
    await cleanupUnattachedCommunityUpload({
      id: "manifest-1",
      userId,
      uploadToken,
      stagingObjectKey: stagingKey,
      uploadType: "put",
      multipartUploadId: null,
      expectedPartCount: null,
      partSizeBytes: null,
      expiresAt: new Date("2026-07-29T12:10:00.000Z"),
      status: "completing",
      finalObjectKey
    }, {
      abortMultipart: async () => undefined,
      deleteCopies: async (key) => { objects.delete(key); },
      markAborted: async () => undefined
    });
    expect(objects).toEqual(new Set());
    expect(deleteCopies).not.toHaveBeenCalled();
    expect(deleteStaging).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it("keeps failed post-abort compensation durable and retries every copy", async () => {
    let releasePromotion!: () => void;
    let promotionFinished!: () => void;
    const promotionGate = new Promise<void>((resolve) => { releasePromotion = resolve; });
    const promoted = new Promise<void>((resolve) => { promotionFinished = resolve; });
    let state: "completing" | "aborting" | "aborted" | "cleanup_pending" = "completing";
    let finalObjectKey: string | null = null;
    const objects = new Set([stagingKey]);
    let failCompensationOnce = true;
    const deletedCopies: string[] = [];
    const deletedStaging: string[] = [];
    const abortService = createCommunityUploadSessionService({
      loadOwned: async () => null,
      claimAbort: async () => {
        const previousState = state;
        state = "aborting";
        return {
          id: "manifest-1",
          userId,
          uploadToken,
          stagingObjectKey: stagingKey,
          uploadType: "put" as const,
          multipartUploadId: null,
          expectedPartCount: null,
          partSizeBytes: null,
          expiresAt: new Date("2026-07-29T12:10:00.000Z"),
          status: "aborting",
          abortCleanupMode: "copies" as const,
          deferAbortCompletion: previousState === "completing" || previousState === "aborting",
          finalObjectKey
        };
      },
      markAborted: async () => { state = "aborted"; },
      listParts: async () => [],
      createPartUrl: async () => "",
      abortMultipart: async () => undefined,
      deleteStaging: async (key) => { deletedStaging.push(key); },
      deleteCopies: async (key) => {
        deletedCopies.push(key);
        objects.delete(key);
      }
    });
    const service = createCommunityUploadService(serviceDependencies({
      recordPromotion: async ({ destinationKey }: { destinationKey: string }) => {
        finalObjectKey = destinationKey;
        return {
          status: "recorded" as const,
          publication: {
            id: "00000000-0000-4000-8000-000000000001",
            publicationToken: "00000000-0000-4000-8000-000000000002",
            sourceType: "manifest" as const,
            sourceId: "00000000-0000-4000-8000-000000000003",
            objectKey: destinationKey
          }
        };
      },
      promoteObject: async () => {
        promotionFinished();
        await promotionGate;
        objects.add(finalObjectKey!);
      },
      finish: async () => state === "completing" ? "finished" as const : "cancelled" as const,
      deleteCopies: async (key: string) => {
        deletedCopies.push(key);
        if (failCompensationOnce) {
          failCompensationOnce = false;
          throw new Error("reserve_delete_timeout");
        }
        objects.delete(key);
      },
      deleteStaging: async (key: string) => { deletedStaging.push(key); objects.delete(key); },
      markCleanupPending: async () => { state = "cleanup_pending"; }
    }));

    const completion = service.completePut({
      userId,
      uploaded: uploaded(),
      now: new Date("2026-07-29T12:05:00.000Z")
    });
    await promoted;
    await abortService.abort({ userId, uploadToken });
    expect(state).toBe("aborting");
    releasePromotion();

    await expect(completion).rejects.toThrow("object_already_consumed");
    expect(state).toBe("cleanup_pending");
    expect(objects).toEqual(new Set([finalObjectKey!]));

    await abortService.abort({ userId, uploadToken });
    expect(objects).toEqual(new Set());
    expect(state).toBe("aborted");
  });

  it("marks a deferred abort terminal only after promoted-copy compensation succeeds", async () => {
    let state: "aborting" | "aborted" = "aborting";
    const events: string[] = [];
    const service = createCommunityUploadService(serviceDependencies({
      finish: async () => "cancelled" as const,
      deleteCopies: async () => { events.push("copies-deleted"); },
      deleteStaging: async () => { events.push("staging-deleted"); },
      completeCancelledCleanup: async () => { events.push("terminal"); state = "aborted"; }
    }));

    await expect(service.completePut({ userId, uploaded: uploaded() })).rejects.toThrow("object_already_consumed");
    expect(events).toEqual(["copies-deleted", "staging-deleted", "terminal"]);
    expect(state).toBe("aborted");
  });

  it("verifies S3-listed multipart ETags and exact actual sizes", () => {
    const submitted = [
      { partNumber: 1, etag: '"one"' },
      { partNumber: 2, etag: '"two"' },
      { partNumber: 3, etag: '"three"' },
      { partNumber: 4, etag: '"four"' }
    ];
    const listed = submitted.map((part, index) => ({ ...part, sizeBytes: index === 3 ? MiB + 1 : 8 * MiB }));
    expect(validateListedMultipartParts({ sizeBytes: 25 * MiB + 1, partSizeBytes: 8 * MiB, submitted, listed })).toEqual({ ok: true });
    expect(validateListedMultipartParts({ sizeBytes: 25 * MiB + 1, partSizeBytes: 8 * MiB, submitted, listed: listed.map((part, index) => index === 0 ? { ...part, sizeBytes: 7 * MiB } : part) })).toEqual({ ok: false, error: "part_size_mismatch" });
    expect(validateListedMultipartParts({ sizeBytes: 25 * MiB + 1, partSizeBytes: 8 * MiB, submitted, listed: listed.map((part, index) => index === 1 ? { ...part, etag: '"other"' } : part) })).toEqual({ ok: false, error: "part_etag_mismatch" });
    expect(validateListedMultipartParts({ sizeBytes: 25 * MiB + 1, partSizeBytes: 8 * MiB, submitted, listed: listed.map((part, index) => index === 3 ? { ...part, partNumber: 3 } : part) })).toEqual({ ok: false, error: "part_count_mismatch" });
  });

  it("reconciles a multipart completion timeout when Head confirms the assembled object", async () => {
    const object = uploaded({ sizeBytes: 25 * MiB + 1 });
    const submitted = Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, etag: `"etag-${index + 1}"` }));
    const service = createCommunityUploadService(serviceDependencies({
      claim: async () => ({ ok: true, intent: { stagingObjectKey: stagingKey, uploadType: "multipart", multipartUploadId: "server-upload", expectedPartCount: 4, partSizeBytes: 8 * MiB } }),
      listParts: async () => submitted.map((part, index) => ({ ...part, sizeBytes: index === 3 ? MiB + 1 : 8 * MiB })),
      completeMultipart: async () => { throw new Error("timeout"); },
      getMetadata: async (key: string) => ({ key, contentType: object.contentType, sizeBytes: object.sizeBytes, etag: '"assembled"' })
    }));

    await expect(service.completeMultipartUpload({ userId, uploaded: object, uploadId: "server-upload", partSizeBytes: 8 * MiB, parts: submitted })).resolves.toMatchObject({ scanStatus: "ready" });
  });
});
