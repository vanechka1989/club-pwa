import type { CommunityUploadedObject } from "@club/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildCommunityFinalObjectKey,
  createCommunityUploadService,
  validateListedMultipartParts
} from "./directUpload";

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
    finish: async () => undefined,
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
    promoteObject: async () => undefined,
    mirrorToReserve: async () => undefined,
    deleteCopies: async () => undefined,
    deleteStaging: async () => undefined,
    ...overrides
  } as any;
}

describe("community direct upload immutable lifecycle", () => {
  it("promotes the verified ETag to a different immutable key and never returns the reusable staging key", async () => {
    const promoted = new Map<string, string>();
    let stagingBytes = "verified-video";
    const finish = vi.fn(async () => undefined);
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
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ objectKey: result.objectKey, scanStatus: "ready" }) }));
  });

  it("uses a private quarantine key for documents and queues durable scanning state", async () => {
    const finish = vi.fn(async () => undefined);
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
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
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

  it("preserves promoted and staging objects when durable completion has an uncertain outcome", async () => {
    const deleteCopies = vi.fn(async () => undefined);
    const deleteStaging = vi.fn(async () => undefined);
    const fail = vi.fn(async () => undefined);
    const service = createCommunityUploadService(serviceDependencies({
      finish: async () => { throw new Error("database_timeout"); },
      deleteCopies,
      deleteStaging,
      fail
    }));

    await expect(service.completePut({ userId, uploaded: uploaded() })).rejects.toThrow("database_timeout");
    expect(deleteCopies).not.toHaveBeenCalled();
    expect(deleteStaging).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
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
