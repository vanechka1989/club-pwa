import type { CommunityUploadIntentResponse } from "@club/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelCommunityFileUpload,
  describeCommunityFile,
  getCommunityFileError,
  uploadCommunityFile
} from "./directUpload";

const MiB = 1024 * 1024;
const userId = "11111111-1111-4111-8111-111111111111";
const uploadToken = "22222222-2222-4222-8222-222222222222";
const objectKey = `community/pending/${userId}/2026-07-29/${uploadToken}-clip.mp4`;

function fakeFile(size: number, name = "clip.mp4", type = "video/mp4") {
  return {
    name,
    type,
    size,
    lastModified: 123,
    slice: (start: number, end: number) => new Blob([new Uint8Array(end - start)], { type })
  } as File;
}

describe("community browser direct upload", () => {
  beforeEach(() => localStorage.clear());

  it("describes supported files and enforces exact limits before requesting an intent", () => {
    expect(describeCommunityFile(fakeFile(15 * MiB, "photo.jpg", "image/jpeg"))).toEqual({
      kind: "image", fileName: "photo.jpg", contentType: "image/jpeg", sizeBytes: 15 * MiB
    });
    expect(getCommunityFileError(fakeFile(100 * MiB))).toBeNull();
    expect(getCommunityFileError(fakeFile(100 * MiB + 1))).toBe("file_too_large");
    expect(getCommunityFileError(fakeFile(1, "script.html", "text/html"))).toBe("unsupported_type");
    expect(getCommunityFileError(fakeFile(1, "archive.zip", "application/zip"))).toBe("unsupported_type");
  });

  it("uses a presigned PUT and finalizes from S3 metadata", async () => {
    const file = fakeFile(10, "photo.png", "image/png");
    const calls: string[] = [];
    const completed = await uploadCommunityFile(file, {
      createIntent: async (input) => ({
        ...input,
        uploadType: "put",
        uploadToken,
        objectKey: objectKey.replace("clip.mp4", "photo.png"),
        uploadUrl: "https://s3.test/put",
        expiresAt: "2026-07-29T12:10:00.000Z"
      }),
      putObject: async (url, blob, contentType) => { calls.push(`put:${url}:${blob.size}:${contentType}`); },
      completePut: async () => { calls.push("complete"); return { ...describeCommunityFile(file), objectKey, uploadToken }; },
      completeMultipart: async () => { throw new Error("unused"); },
      refreshMultipart: async () => { throw new Error("unused"); },
      abortUpload: async () => undefined,
      storage: localStorage
    }, { userId });

    expect(calls).toEqual(["put:https://s3.test/put:10:image/png", "complete"]);
    expect(completed).toMatchObject({ kind: "image", fileName: "photo.png", uploadToken });
  });

  it("forwards byte progress and aborts the server intent when the caller cancels", async () => {
    const file = fakeFile(10, "photo.png", "image/png");
    const progress: number[] = [];
    const abortUpload = vi.fn(async () => undefined);
    const controller = new AbortController();
    let started!: () => void;
    const transportStarted = new Promise<void>((resolve) => { started = resolve; });
    const work = uploadCommunityFile(file, {
      createIntent: async (input) => ({
        ...input,
        uploadType: "put",
        uploadToken,
        objectKey: objectKey.replace("clip.mp4", "photo.png"),
        uploadUrl: "https://s3.test/private-signature",
        expiresAt: "2099-07-29T12:10:00.000Z"
      }),
      putObject: async (_url, body, _contentType, _partNumber, runtime) => {
        runtime?.onProgress?.(body.size / 2);
        started();
        return new Promise<void>((_resolve, reject) => {
          runtime?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      },
      completePut: async () => { throw new Error("must_not_complete"); },
      completeMultipart: async () => { throw new Error("unused"); },
      refreshMultipart: async () => { throw new Error("unused"); },
      abortUpload,
      storage: localStorage
    }, { userId, signal: controller.signal, onProgress: (value) => progress.push(value) });

    await transportStarted;
    expect(progress).toContain(50);
    controller.abort();
    await expect(work).rejects.toMatchObject({ name: "AbortError" });
    expect(abortUpload).toHaveBeenCalledWith(uploadToken);
    await expect(cancelCommunityFileUpload(file, userId, { abortUpload, storage: localStorage })).resolves.toEqual({ ok: true });
    expect(abortUpload).toHaveBeenCalledTimes(1);
  });

  it("uploads 8-MiB multipart chunks with at most four concurrent S3 requests", async () => {
    const file = fakeFile(33 * MiB);
    let active = 0;
    let maxActive = 0;
    const observedSizes: number[] = [];
    const session: CommunityUploadIntentResponse = {
      ...describeCommunityFile(file),
      uploadType: "multipart",
      uploadToken,
      objectKey,
      uploadId: "multipart-1",
      partSizeBytes: 8 * MiB,
      parts: Array.from({ length: 5 }, (_, index) => ({ partNumber: index + 1, uploadUrl: `https://s3.test/part-${index + 1}` })),
      expiresAt: "2099-07-29T12:10:00.000Z"
    };
    const completeMultipart = vi.fn(async () => ({ ...describeCommunityFile(file), objectKey, uploadToken }));

    await uploadCommunityFile(file, {
      createIntent: async () => session,
      putObject: async (_url, blob) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        observedSizes.push(blob.size);
        await Promise.resolve();
        active -= 1;
        return `etag-${observedSizes.length}`;
      },
      completePut: async () => { throw new Error("unused"); },
      completeMultipart,
      refreshMultipart: async () => { throw new Error("unused"); },
      abortUpload: async () => undefined,
      storage: localStorage
    }, { userId });

    expect(maxActive).toBe(4);
    expect(observedSizes.sort((a, b) => b - a)).toEqual([8 * MiB, 8 * MiB, 8 * MiB, 8 * MiB, MiB]);
    expect(completeMultipart).toHaveBeenCalledWith(expect.objectContaining({
      uploadToken,
      parts: expect.arrayContaining([
        expect.objectContaining({ partNumber: 1 }),
        expect.objectContaining({ partNumber: 5 })
      ])
    }));
  });

  it("persists only resumable session metadata and reuses it while the same File remains selected", async () => {
    const file = fakeFile(26 * MiB);
    const session: CommunityUploadIntentResponse = {
      ...describeCommunityFile(file),
      uploadType: "multipart",
      uploadToken,
      objectKey,
      uploadId: "multipart-1",
      partSizeBytes: 8 * MiB,
      parts: Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, uploadUrl: `https://s3.test/part-${index + 1}` })),
      expiresAt: "2099-07-29T12:10:00.000Z"
    };
    const createIntent = vi.fn(async () => session);
    let fail = true;
    const dependencies = {
      createIntent,
      putObject: async (_url: string, _blob: Blob, _contentType: string, partNumber?: number) => {
        if (fail && partNumber === 3) throw new Error("offline");
        return `etag-${partNumber}`;
      },
      completePut: async () => { throw new Error("unused"); },
      completeMultipart: async () => ({ ...describeCommunityFile(file), objectKey, uploadToken }),
      refreshMultipart: async () => ({
        uploadToken,
        uploadId: "multipart-1",
        partSizeBytes: 8 * MiB,
        parts: session.parts,
        completedParts: [],
        expiresAt: session.expiresAt
      }),
      abortUpload: async () => undefined,
      storage: localStorage
    };

    await expect(uploadCommunityFile(file, dependencies, { userId })).rejects.toThrow("offline");
    const persisted = localStorage.getItem("club-community-multipart-sessions") ?? "";
    expect(persisted).toContain("multipart-1");
    expect(persisted).not.toContain("Uint8Array");
    expect(persisted).not.toContain("blob");
    expect(persisted).not.toContain("https://");
    expect(persisted).toContain(userId);

    fail = false;
    await uploadCommunityFile(file, dependencies, { userId });
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("club-community-multipart-sessions")).toBe("[]");
  });

  it("waits for in-flight parts to settle before exposing a multipart failure for retry", async () => {
    const file = fakeFile(26 * MiB);
    let releaseGate!: () => void;
    let markFailureStarted!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const failureStarted = new Promise<void>((resolve) => { markFailureStarted = resolve; });
    let rejected = false;
    const upload = uploadCommunityFile(file, {
      createIntent: async () => ({
        ...describeCommunityFile(file),
        uploadType: "multipart",
        uploadToken,
        objectKey,
        uploadId: "multipart-1",
        partSizeBytes: 8 * MiB,
        parts: Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, uploadUrl: `https://s3.test/part-${index + 1}` })),
        expiresAt: "2099-07-29T12:10:00.000Z"
      }),
      putObject: async (_url, _body, _type, partNumber) => {
        if (partNumber === 1) await gate;
        if (partNumber === 2) {
          markFailureStarted();
          throw new Error("offline");
        }
        return `etag-${partNumber}`;
      },
      completePut: async () => { throw new Error("unused"); },
      completeMultipart: async () => ({ ...describeCommunityFile(file), objectKey, uploadToken }),
      refreshMultipart: async () => { throw new Error("unused"); },
      abortUpload: async () => undefined,
      storage: localStorage
    }, { userId }).catch((error) => {
      rejected = true;
      throw error;
    });

    await failureStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejected).toBe(false);
    releaseGate();
    await expect(upload).rejects.toThrow("offline");
  });

  it("never resumes another user or a different File object with spoofed metadata", async () => {
    const first = fakeFile(26 * MiB);
    const lookalike = fakeFile(26 * MiB);
    const createIntent = vi.fn(async () => ({
      ...describeCommunityFile(first),
      uploadType: "multipart" as const,
      uploadToken,
      objectKey,
      uploadId: "multipart-1",
      partSizeBytes: 8 * MiB,
      parts: Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, uploadUrl: `https://s3.test/part-${index + 1}` })),
      expiresAt: "2099-07-29T12:10:00.000Z"
    }));
    const dependencies = {
      createIntent,
      putObject: async (_url: string, _blob: Blob, _type: string, partNumber?: number) => {
        if (partNumber === 2) throw new Error("offline");
        return `etag-${partNumber}`;
      },
      completePut: async () => { throw new Error("unused"); },
      completeMultipart: async () => { throw new Error("unused"); },
      refreshMultipart: async () => { throw new Error("must_not_refresh"); },
      abortUpload: async () => undefined,
      storage: localStorage
    };

    await expect(uploadCommunityFile(first, dependencies, { userId })).rejects.toThrow("offline");
    await expect(uploadCommunityFile(lookalike, dependencies, { userId })).rejects.toThrow("offline");
    await expect(uploadCommunityFile(first, dependencies, { userId: "other-user" })).rejects.toThrow("offline");
    expect(createIntent).toHaveBeenCalledTimes(3);
  });

  it("aborts and forgets a multipart upload after an unrecoverable protocol failure", async () => {
    const file = fakeFile(26 * MiB);
    const abortUpload = vi.fn(async () => undefined);
    await expect(uploadCommunityFile(file, {
      createIntent: async () => ({
        ...describeCommunityFile(file),
        uploadType: "multipart",
        uploadToken,
        objectKey,
        uploadId: "multipart-1",
        partSizeBytes: 8 * MiB,
        parts: Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, uploadUrl: `https://s3.test/part-${index + 1}` })),
        expiresAt: "2099-07-29T12:10:00.000Z"
      }),
      putObject: async (_url, _blob, _type, partNumber) => partNumber === 2 ? undefined : `etag-${partNumber}`,
      completePut: async () => { throw new Error("unused"); },
      completeMultipart: async () => { throw new Error("unused"); },
      refreshMultipart: async () => { throw new Error("unused"); },
      abortUpload,
      storage: localStorage
    }, { userId })).rejects.toThrow("missing_part_etag");

    expect(abortUpload).toHaveBeenCalledWith(uploadToken);
    expect(localStorage.getItem("club-community-multipart-sessions")).toBe("[]");
  });
});
