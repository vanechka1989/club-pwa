import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const uploadToken = "22222222-2222-4222-8222-222222222222";
const objectKey = `community/pending/${userId}/2026-07-29/${uploadToken}-clip.mp4`;

const mocks = vi.hoisted(() => ({
  createIntent: vi.fn(),
  completePut: vi.fn(),
  completeMultipartUpload: vi.fn(),
  findManifest: vi.fn()
}));

vi.mock("../community/directUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../community/directUpload")>()),
  createCommunityUploadService: vi.fn(() => ({
    createIntent: mocks.createIntent,
    completePut: mocks.completePut,
    completeMultipartUpload: mocks.completeMultipartUpload
  }))
}));
vi.mock("../db/client", () => ({
  db: {
    query: { communityUploadManifests: { findFirst: mocks.findManifest } },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn()
  }
}));
vi.mock("../middleware/auth", () => ({
  telegramAuth: async (c: any, next: () => Promise<void>) => {
    c.set("telegramUser", { id: "web:user" });
    c.set("userId", userId);
    c.set("previewRole", "member");
    c.set("previewMembershipStatus", "active");
    await next();
  }
}));
vi.mock("../security/persistentWriteRateLimit", () => ({ persistentWriteRateLimit: async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../security/persistentCommunityReadRateLimit", () => ({ persistentCommunityReadRateLimit: async (_c: unknown, next: () => Promise<void>) => next() }));
vi.mock("../admin/roles", () => ({ getUserRole: vi.fn(async () => "member"), hasAdminPermission: vi.fn(async () => false), isOwnerTelegramId: vi.fn(async () => false) }));
vi.mock("../moderation/mutes", () => ({ getActiveMute: vi.fn(async () => null) }));
vi.mock("../community/topicStateRepository", () => ({ topicStateRepository: { getStates: vi.fn(async () => new Map()) } }));
vi.mock("../community/realtime", () => ({ publishCommunityChange: vi.fn(), subscribeToCommunityChanges: vi.fn(() => () => undefined) }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../notifications/create", () => ({ createAppNotification: vi.fn() }));
vi.mock("../storage/s3", () => ({
  abortMultipartUpload: vi.fn(),
  completeMultipartUpload: vi.fn(),
  createMultipartPartUploadUrl: vi.fn(),
  createMultipartUpload: vi.fn(),
  createObjectUploadUrl: vi.fn(),
  deleteObject: vi.fn(),
  deleteObjectCopies: vi.fn(),
  downloadObjectPrefix: vi.fn(),
  downloadObjectRange: vi.fn(),
  getObjectMetadata: vi.fn(),
  getObjectReadUrl: vi.fn(),
  listMultipartUploadParts: vi.fn(),
  mirrorObjectToReserve: vi.fn(),
  promoteObjectVersion: vi.fn(),
  downloadObjectBytes: vi.fn(),
  uploadObjectStream: vi.fn(),
  uploadObject: vi.fn()
}));

import { communityRoute } from "../routes/community";

const completed = {
  kind: "video" as const,
  fileName: "clip.mp4",
  contentType: "video/mp4" as const,
  sizeBytes: 1024,
  objectKey,
  uploadToken
};

describe("community direct S3 upload routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIntent.mockResolvedValue({
      ...completed,
      uploadType: "put",
      uploadUrl: "https://s3.test/put",
      expiresAt: "2026-07-29T12:10:00.000Z"
    });
    mocks.completePut.mockResolvedValue(completed);
    mocks.completeMultipartUpload.mockResolvedValue(completed);
    mocks.findManifest.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      userId,
      uploadToken,
      kind: "video",
      fileName: "clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      durationSeconds: null,
      stagingObjectKey: objectKey,
      uploadType: "put",
      multipartUploadId: null,
      partSizeBytes: null
    });
  });

  it("creates a direct S3 intent for an authenticated community member", async () => {
    const response = await communityRoute.request("/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "video", fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024 })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ uploadType: "put", uploadUrl: "https://s3.test/put" });
    expect(mocks.createIntent).toHaveBeenCalledWith({ userId, input: { kind: "video", fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 1024 } });
  });

  it("rejects unsupported MIME before issuing a signed URL", async () => {
    const response = await communityRoute.request("/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "document", fileName: "page.html", contentType: "text/html", sizeBytes: 10 })
    });

    expect(response.status).toBe(400);
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("finalizes PUT and multipart uploads through S3 metadata verification", async () => {
    const put = await communityRoute.request("/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadToken })
    });
    mocks.findManifest.mockResolvedValueOnce({
      id: "44444444-4444-4444-8444-444444444444",
      userId,
      uploadToken,
      kind: "video",
      fileName: "clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 25 * 1024 * 1024 + 1,
      durationSeconds: null,
      stagingObjectKey: objectKey,
      uploadType: "multipart",
      multipartUploadId: "multipart-1",
      partSizeBytes: 8 * 1024 * 1024
    });
    const multipart = await communityRoute.request("/uploads/multipart/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        uploadToken,
        parts: Array.from({ length: 4 }, (_, index) => ({ partNumber: index + 1, etag: `etag-${index + 1}` }))
      })
    });

    expect(put.status).toBe(200);
    expect(multipart.status).toBe(200);
    expect(mocks.completePut).toHaveBeenCalledWith({ userId, uploaded: completed });
    expect(mocks.completeMultipartUpload).toHaveBeenCalledWith(expect.objectContaining({ userId, uploadId: "multipart-1", partSizeBytes: 8 * 1024 * 1024 }));
  });

  it("rejects client-supplied object metadata during completion", async () => {
    const response = await communityRoute.request("/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completed)
    });

    expect(response.status).toBe(400);
    expect(mocks.findManifest).not.toHaveBeenCalled();
    expect(mocks.completePut).not.toHaveBeenCalled();
  });

  it("has no API endpoint that accepts direct upload bytes", async () => {
    const response = await communityRoute.request("/uploads", { method: "PUT", body: new Uint8Array([1, 2, 3]) });
    expect(response.status).toBe(404);
  });
});
