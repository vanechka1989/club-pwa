import { describe, expect, it, vi } from "vitest";
import { createCommunityUploadSessionService, cleanupExpiredCommunityUpload } from "./uploadSessions";

const record = {
  id: "manifest-1",
  userId: "11111111-1111-4111-8111-111111111111",
  uploadToken: "22222222-2222-4222-8222-222222222222",
  stagingObjectKey: "community/pending/u/file.bin",
  uploadType: "multipart" as const,
  multipartUploadId: "upload-1",
  expectedPartCount: 4,
  partSizeBytes: 8 * 1024 * 1024,
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  status: "uploading"
};

describe("community upload session recovery and cleanup", () => {
  it("refreshes only owner-checked multipart URLs and returns authoritative S3 ETags", async () => {
    const service = createCommunityUploadSessionService({
      loadOwned: async () => record,
      claimAbort: async () => record,
      markAborted: async () => undefined,
      listParts: async () => [{ partNumber: 1, etag: '"etag-1"', sizeBytes: 8 * 1024 * 1024 }],
      createPartUrl: async ({ partNumber }: { partNumber: number }) => `https://s3.test/fresh-${partNumber}`,
      abortMultipart: async () => undefined,
      deleteStaging: async () => undefined
    });

    await expect(service.refresh({ userId: record.userId, uploadToken: record.uploadToken })).resolves.toMatchObject({
      uploadId: "upload-1",
      completedParts: [{ partNumber: 1, etag: '"etag-1"' }],
      parts: expect.arrayContaining([{ partNumber: 1, uploadUrl: "https://s3.test/fresh-1" }, { partNumber: 4, uploadUrl: "https://s3.test/fresh-4" }])
    });
  });

  it("rejects a foreign abort and makes owner cleanup idempotent", async () => {
    const abortMultipart = vi.fn(async () => undefined);
    const deleteStaging = vi.fn(async () => undefined);
    const markAborted = vi.fn(async () => undefined);
    let claimed = false;
    const service = createCommunityUploadSessionService({
      loadOwned: async () => null,
      claimAbort: async ({ userId }: { userId: string }) => {
        if (userId !== record.userId) return null;
        if (claimed) return { alreadyAborted: true as const };
        claimed = true;
        return record;
      },
      markAborted,
      listParts: async () => [],
      createPartUrl: async () => "unused",
      abortMultipart,
      deleteStaging
    });

    await expect(service.abort({ userId: "other", uploadToken: record.uploadToken })).rejects.toThrow("foreign_object");
    await expect(service.abort({ userId: record.userId, uploadToken: record.uploadToken })).resolves.toEqual({ ok: true });
    await expect(service.abort({ userId: record.userId, uploadToken: record.uploadToken })).resolves.toEqual({ ok: true });
    expect(abortMultipart).toHaveBeenCalledTimes(1);
    expect(deleteStaging).toHaveBeenCalledTimes(1);
  });

  it("aborts and deletes expired multipart staging idempotently", async () => {
    const events: string[] = [];
    await cleanupExpiredCommunityUpload(record, {
      abortMultipart: async () => { events.push("abort"); },
      deleteStaging: async () => { events.push("delete"); },
      markAborted: async () => { events.push("done"); }
    });
    expect(events).toEqual(["abort", "delete", "done"]);
  });
});
