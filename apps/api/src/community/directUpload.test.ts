import type { CommunityUploadIntent, CommunityUploadedObject } from "@club/shared";
import { describe, expect, it } from "vitest";
import {
  buildCommunityPendingObjectKey,
  createCommunityUploadService,
  getCommunityUploadError,
  validateCommunityObject,
  validateCommunitySignature,
  validateMultipartCompletion
} from "./directUpload";

const MiB = 1024 * 1024;
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const uploadToken = "33333333-3333-4333-8333-333333333333";

function intent(overrides: Partial<CommunityUploadIntent> = {}): CommunityUploadIntent {
  return {
    kind: "video",
    fileName: "clip.mp4",
    contentType: "video/mp4",
    sizeBytes: 100 * MiB,
    ...overrides
  } as CommunityUploadIntent;
}

function uploaded(overrides: Partial<CommunityUploadedObject> = {}): CommunityUploadedObject {
  return {
    ...intent({ sizeBytes: 1024 }),
    uploadToken,
    objectKey: `community/pending/${userId}/2026-07-29/${uploadToken}-clip.mp4`,
    ...overrides
  } as CommunityUploadedObject;
}

describe("community direct upload policy", () => {
  it("enforces the exact size, MIME, filename, count, and voice-duration limits", () => {
    expect(getCommunityUploadError(intent())).toBeNull();
    expect(getCommunityUploadError(intent({ sizeBytes: 100 * MiB + 1 }))).toBe("file_too_large");
    expect(getCommunityUploadError(intent({ contentType: "video/webm", fileName: "clip.mp4" }))).toBe("type_extension_mismatch");
    expect(getCommunityUploadError(intent({ contentType: "video/mp4", fileName: "clip.exe" }))).toBe("type_extension_mismatch");
    expect(getCommunityUploadError(intent({ kind: "document", contentType: "application/zip", fileName: "archive.zip", sizeBytes: 1 } as never))).toBe("unsupported_type");
    expect(getCommunityUploadError(intent({ kind: "image", contentType: "image/svg+xml", fileName: "image.svg", sizeBytes: 1 } as never))).toBe("unsupported_type");
    expect(getCommunityUploadError(intent({ kind: "document", contentType: "text/html", fileName: "page.html", sizeBytes: 1 } as never))).toBe("unsupported_type");
    expect(getCommunityUploadError(intent({ kind: "voice", contentType: "audio/webm", fileName: "voice.webm", sizeBytes: 30 * MiB, durationSeconds: 300 }))).toBeNull();
    expect(getCommunityUploadError(intent({ kind: "voice", contentType: "audio/webm", fileName: "voice.webm", sizeBytes: 1, durationSeconds: 301 }))).toBe("invalid_duration");
    expect(getCommunityUploadError(intent({ kind: "image", contentType: "image/jpeg", fileName: "photo.jpg", sizeBytes: 15 * MiB }), 10)).toBeNull();
    expect(getCommunityUploadError(intent({ kind: "image", contentType: "image/jpeg", fileName: "photo.jpg", sizeBytes: 1 }), 11)).toBe("too_many_files");
  });

  it("generates only pending keys scoped to the authenticated user and token", () => {
    expect(buildCommunityPendingObjectKey({
      userId,
      uploadToken,
      fileName: "Quarterly Report (final).PDF",
      now: new Date("2026-07-29T12:00:00.000Z")
    })).toBe(`community/pending/${userId}/2026-07-29/${uploadToken}-quarterly-report-final-.pdf`);
  });

  it("checks real file signatures and rejects disguised executable, ZIP, SVG, and HTML content", () => {
    const bytes = (...values: number[]) => new Uint8Array(values);
    const text = (value: string) => new TextEncoder().encode(value);

    expect(validateCommunitySignature(intent({ contentType: "video/mp4" }), bytes(0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))).toBe(true);
    expect(validateCommunitySignature(intent({ contentType: "video/mp4" }), bytes(1, 2, 3, 4, 5, 6, 7, 8, 0x66, 0x74, 0x79, 0x70))).toBe(false);
    expect(validateCommunitySignature(intent({ kind: "voice", contentType: "audio/mp4", fileName: "voice.m4a", sizeBytes: 12, durationSeconds: 3 }), bytes(0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x66, 0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70))).toBe(true);
    expect(validateCommunitySignature(intent({ contentType: "video/webm", fileName: "clip.webm" }), bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(validateCommunitySignature(intent({ kind: "image", contentType: "image/png", fileName: "photo.png", sizeBytes: 1 }), bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(validateCommunitySignature(intent({ kind: "document", contentType: "application/pdf", fileName: "guide.pdf", sizeBytes: 1 }), text("%PDF-1.7"))).toBe(true);
    expect(validateCommunitySignature(intent({ kind: "document", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: "guide.docx", sizeBytes: 1 }), bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true);

    for (const unsafe of [bytes(0x4d, 0x5a, 0x90, 0), bytes(0x50, 0x4b, 0x03, 0x04), text("<svg xmlns='http://www.w3.org/2000/svg'>"), text("<!doctype html><html>")]) {
      expect(validateCommunitySignature(intent({ contentType: "video/mp4" }), unsafe)).toBe(false);
    }
  });

  it("rejects foreign, expired, reused, mismatched, and signature-invalid objects", () => {
    const object = uploaded();
    const metadata = { key: object.objectKey, contentType: object.contentType, sizeBytes: object.sizeBytes };
    const leadingBytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const base = {
      uploaded: object,
      userId,
      metadata,
      leadingBytes,
      expiresAt: new Date("2026-07-29T12:10:00.000Z"),
      now: new Date("2026-07-29T12:05:00.000Z"),
      consumed: false
    };

    expect(validateCommunityObject(base)).toEqual({ ok: true, value: object });
    expect(validateCommunityObject({ ...base, userId: otherUserId })).toEqual({ ok: false, error: "foreign_object" });
    expect(validateCommunityObject({ ...base, now: new Date("2026-07-29T12:10:01.000Z") })).toEqual({ ok: false, error: "expired_intent" });
    expect(validateCommunityObject({ ...base, consumed: true })).toEqual({ ok: false, error: "object_already_consumed" });
    expect(validateCommunityObject({ ...base, metadata: { ...metadata, sizeBytes: 1025 } })).toEqual({ ok: false, error: "metadata_mismatch" });
    expect(validateCommunityObject({ ...base, leadingBytes: new Uint8Array([0x4d, 0x5a]) })).toEqual({ ok: false, error: "signature_mismatch" });
  });

  it("requires every expected multipart part exactly once and rejects excessive part counts", () => {
    const parts = Array.from({ length: 13 }, (_, index) => ({ partNumber: index + 1, etag: `etag-${index + 1}` }));
    expect(validateMultipartCompletion({ sizeBytes: 100 * MiB, partSizeBytes: 8 * MiB, parts })).toEqual({ ok: true });
    expect(validateMultipartCompletion({ sizeBytes: 100 * MiB, partSizeBytes: 8 * MiB, parts: parts.slice(0, 12) })).toEqual({ ok: false, error: "missing_parts" });
    expect(validateMultipartCompletion({ sizeBytes: 100 * MiB, partSizeBytes: 8 * MiB, parts: [...parts.slice(0, 12), { partNumber: 12, etag: "duplicate" }] })).toEqual({ ok: false, error: "duplicate_part" });
    expect(validateMultipartCompletion({ sizeBytes: 100 * MiB, partSizeBytes: 8 * MiB, parts: [...parts, { partNumber: 14, etag: "extra" }] })).toEqual({ ok: false, error: "too_many_parts" });
    expect(validateMultipartCompletion({ sizeBytes: 801 * MiB, partSizeBytes: 8 * MiB, parts: [] })).toEqual({ ok: false, error: "too_many_parts" });
  });

  it("issues short-lived direct PUT and multipart S3 intents without an API upload hop", async () => {
    const issued: Array<Record<string, unknown>> = [];
    const service = createCommunityUploadService({
      issue: async (record) => { issued.push(record); },
      claim: async () => ({ ok: true, intent: { stagingObjectKey: "unused", uploadType: "put", multipartUploadId: null, expectedPartCount: null, partSizeBytes: null } }),
      finish: async () => "finished" as const,
      fail: async () => undefined,
      createPutUrl: async ({ key }) => ({ key, uploadUrl: "https://s3.test/put", expiresAt: new Date("2026-07-29T12:10:00.000Z") }),
      createMultipart: async ({ key, partsCount }) => ({ key, uploadId: "multipart-1", parts: Array.from({ length: partsCount }, (_, index) => ({ partNumber: index + 1 })), expiresAt: new Date("2026-07-29T12:10:00.000Z") }),
      createPartUrl: async ({ partNumber }) => `https://s3.test/part-${partNumber}`,
      completeMultipart: async ({ key }) => ({ key }),
      abortMultipart: async () => undefined,
      listParts: async () => [],
      getMetadata: async (key) => ({ key, contentType: "video/mp4", sizeBytes: 1 }),
      getLeadingBytes: async () => new Uint8Array(),
      validateOoxml: async () => true,
      recordPromotion: async () => ({
        status: "recorded" as const,
        publication: {
          id: "00000000-0000-4000-8000-000000000001",
          publicationToken: "00000000-0000-4000-8000-000000000002",
          sourceType: "manifest" as const,
          sourceId: "00000000-0000-4000-8000-000000000003",
          objectKey: "community/final/user/video.mp4",
          targets: ["primary" as const]
        }
      }),
      publishPromotion: async (_publication, work) => {
        const written = await work.write(new AbortController().signal);
        return work.commit(undefined, written);
      },
      markCleanupPending: async () => undefined,
      completeCancelledCleanup: async () => undefined,
      promoteObject: async () => undefined,
      mirrorToReserve: async () => undefined,
      deleteCopies: async () => undefined,
      deleteStaging: async () => undefined
    });
    const tokenFactory = () => uploadToken;

    const put = await service.createIntent({
      userId,
      input: intent({ sizeBytes: 25 * MiB }),
      now: new Date("2026-07-29T12:00:00.000Z"),
      tokenFactory
    });
    const multipart = await service.createIntent({
      userId,
      input: intent({ sizeBytes: 25 * MiB + 1 }),
      now: new Date("2026-07-29T12:00:00.000Z"),
      tokenFactory
    });

    expect(put).toMatchObject({ uploadType: "put", uploadUrl: "https://s3.test/put", uploadToken, sizeBytes: 25 * MiB });
    expect(multipart).toMatchObject({
      uploadType: "multipart",
      uploadId: "multipart-1",
      partSizeBytes: 8 * MiB,
      parts: [
        { partNumber: 1, uploadUrl: "https://s3.test/part-1" },
        { partNumber: 2, uploadUrl: "https://s3.test/part-2" },
        { partNumber: 3, uploadUrl: "https://s3.test/part-3" },
        { partNumber: 4, uploadUrl: "https://s3.test/part-4" }
      ]
    });
    expect(issued).toHaveLength(2);
    expect(String(issued[0]?.objectKey)).toMatch(new RegExp(`^community/pending/${userId}/2026-07-29/${uploadToken}-`));
  });

  it("claims and verifies a PUT exactly once before returning the completed object", async () => {
    const events: string[] = [];
    let attachmentDeadline = "";
    const object = uploaded();
    const service = createCommunityUploadService({
      issue: async () => undefined,
      claim: async () => { events.push("claim"); return { ok: true, intent: { stagingObjectKey: object.objectKey, uploadType: "put", multipartUploadId: null, expectedPartCount: null, partSizeBytes: null } }; },
      finish: async (record) => { events.push("finish"); attachmentDeadline = record.expiresAt.toISOString(); return "finished" as const; },
      fail: async () => { events.push("fail"); },
      createPutUrl: async () => { throw new Error("unused"); },
      createMultipart: async () => { throw new Error("unused"); },
      createPartUrl: async () => { throw new Error("unused"); },
      completeMultipart: async () => { throw new Error("unused"); },
      abortMultipart: async () => undefined,
      listParts: async () => [],
      getMetadata: async (key) => ({ key, contentType: object.contentType, sizeBytes: object.sizeBytes, etag: '"etag"' }),
      getLeadingBytes: async () => new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
      validateOoxml: async () => true,
      recordPromotion: async () => {
        events.push("ledger");
        return {
          status: "recorded" as const,
          publication: {
            id: "00000000-0000-4000-8000-000000000001",
            publicationToken: "00000000-0000-4000-8000-000000000002",
            sourceType: "manifest" as const,
            sourceId: "00000000-0000-4000-8000-000000000003",
            objectKey: "community/final/user/video.mp4",
            targets: ["primary" as const]
          }
        };
      },
      publishPromotion: async (_publication, work) => {
        events.push("publication:io");
        const written = await work.write(new AbortController().signal);
        events.push("publication:commit");
        const result = await work.commit(undefined, written);
        events.push("publication:committed");
        return result;
      },
      markCleanupPending: async () => undefined,
      completeCancelledCleanup: async () => undefined,
      promoteObject: async () => undefined,
      mirrorToReserve: async () => { events.push("mirror"); },
      deleteCopies: async () => { events.push("delete"); },
      deleteStaging: async () => { events.push("delete-staging"); }
    });

    await expect(service.completePut({ userId, uploaded: object, now: new Date("2026-07-29T12:05:00.000Z") })).resolves.toMatchObject({
      ...object,
      objectKey: expect.stringMatching(/^community\/final\//),
      scanStatus: "ready"
    });
    expect(events).toEqual([
      "claim",
      "ledger",
      "publication:io",
      "mirror",
      "publication:commit",
      "finish",
      "publication:committed",
      "delete-staging"
    ]);
    expect(attachmentDeadline).toBe("2026-07-29T12:20:00.000Z");
  });

  it("aborts multipart and cleans an invalid completed object without making it reusable", async () => {
    const events: string[] = [];
    const object = uploaded({ sizeBytes: 25 * MiB + 1 });
    const parts = Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, etag: `etag-${index + 1}` }));
    const service = createCommunityUploadService({
      issue: async () => undefined,
      claim: async () => ({ ok: true, intent: { stagingObjectKey: object.objectKey, uploadType: "multipart", multipartUploadId: "multipart-1", expectedPartCount: 4, partSizeBytes: 8 * MiB } }),
      finish: async () => { events.push("finish"); return "finished" as const; },
      fail: async (_record, error) => { events.push(`fail:${error}`); },
      createPutUrl: async () => { throw new Error("unused"); },
      createMultipart: async () => { throw new Error("unused"); },
      createPartUrl: async () => { throw new Error("unused"); },
      completeMultipart: async () => { events.push("complete"); return { key: object.objectKey }; },
      abortMultipart: async () => { events.push("abort"); },
      listParts: async () => parts.map((part, index) => ({ ...part, sizeBytes: index === 3 ? MiB + 1 : 8 * MiB })),
      getMetadata: async (key) => ({ key, contentType: object.contentType, sizeBytes: object.sizeBytes, etag: '"etag"' }),
      getLeadingBytes: async () => new Uint8Array([0x4d, 0x5a, 0x90, 0]),
      validateOoxml: async () => true,
      recordPromotion: async () => ({
        status: "recorded" as const,
        publication: {
          id: "00000000-0000-4000-8000-000000000001",
          publicationToken: "00000000-0000-4000-8000-000000000002",
          sourceType: "manifest" as const,
          sourceId: "00000000-0000-4000-8000-000000000003",
          objectKey: "community/final/user/video.mp4",
          targets: ["primary" as const]
        }
      }),
      publishPromotion: async (_publication, work) => {
        const written = await work.write(new AbortController().signal);
        return work.commit(undefined, written);
      },
      markCleanupPending: async () => undefined,
      completeCancelledCleanup: async () => undefined,
      promoteObject: async () => undefined,
      mirrorToReserve: async () => { events.push("mirror"); },
      deleteCopies: async () => { events.push("delete"); },
      deleteStaging: async () => { events.push("delete-staging"); }
    });

    await expect(service.completeMultipartUpload({
      userId,
      uploaded: object,
      uploadId: "multipart-1",
      partSizeBytes: 8 * MiB,
      parts,
      now: new Date("2026-07-29T12:05:00.000Z")
    })).rejects.toThrow("signature_mismatch");
    expect(events).toEqual(["complete", "delete-staging", "fail:signature_mismatch"]);
  });

});
