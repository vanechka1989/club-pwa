import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const topicId = "22222222-2222-4222-8222-222222222222";
const uploadToken = "33333333-3333-4333-8333-333333333333";
const manifestId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const objectKey = `community/quarantine/${userId}/${uploadToken}-photo.png`;

const mocks = vi.hoisted(() => {
  const state = {
    activeMute: null as null | { id: string; kind: "permanent"; expiresAt: Date | null },
    topic: null as any,
    manifest: null as any,
    message: null as any,
    attachments: [] as any[],
    inserted: [] as any[],
    transaction: vi.fn(),
    execute: vi.fn(),
    database: null as any
  };
  state.database = {
    query: {
      clubChatTopics: { findFirst: vi.fn(async () => state.topic) },
      communityUploadManifests: { findFirst: vi.fn(), findMany: vi.fn(async () => [state.manifest]) },
      clubMessageAttachments: { findMany: vi.fn(async () => state.attachments) },
      clubChatMessages: { findFirst: vi.fn(async () => state.message) },
      clubMessageReactions: { findMany: vi.fn(async () => []) },
      clubMessageMentions: { findMany: vi.fn(async () => []) },
      clubPolls: { findFirst: vi.fn(async () => null) }
    },
    execute: state.execute,
    select: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(() => ({
      values: vi.fn((values: any) => {
        state.inserted.push(values);
        if (values.kind === "images") {
          state.message = {
          id: messageId,
          topicId,
          userId,
          replyToMessageId: values.replyToMessageId,
          body: values.body,
          kind: values.kind,
          isSystem: false,
          status: "visible",
          moderatedByUserId: null,
          moderatedAt: null,
          moderationReason: null,
          pinnedAt: null,
          pinnedByUserId: null,
          purgeAt: null,
          clientOperationId: null,
          createRequestFingerprint: null,
          editedAt: null,
          deletedByUserAt: null,
          deletedContentExpiresAt: null,
          deletedCleanupClaimId: null,
          deletedCleanupClaimedAt: null,
          createdAt: new Date("2026-07-29T12:00:00.000Z"),
          updatedAt: new Date("2026-07-29T12:00:00.000Z"),
          user: {
            id: userId,
            telegramId: "web:user",
            firstName: "Ivan",
            username: null,
            photoUrl: null
          }
        };
          return { returning: async () => [state.message] };
        }
        const attachment = {
          ...values,
          createdAt: new Date("2026-07-29T12:00:00.000Z"),
          deletedAt: null,
          scannedAt: null
        };
        state.attachments.push(attachment);
        return Promise.resolve();
      })
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => ({
        where: vi.fn(() => ({ returning: async () => {
          Object.assign(state.manifest, values);
          return [{ id: manifestId }];
        } }))
      }))
    })),
    transaction: state.transaction
  };
  return state;
});

vi.mock("../db/client", () => ({ db: mocks.database }));
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
vi.mock("../moderation/mutes", () => ({ getActiveMute: vi.fn(async () => mocks.activeMute) }));
vi.mock("../community/topicStateRepository", () => ({ topicStateRepository: { getStates: vi.fn(async () => new Map()) } }));
vi.mock("../community/realtime", () => ({ publishCommunityChange: vi.fn(), subscribeToCommunityChanges: vi.fn(() => () => undefined) }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../notifications/create", () => ({ createAppNotification: vi.fn() }));
vi.mock("../storage/s3", () => ({
  abortMultipartUpload: vi.fn(), completeMultipartUpload: vi.fn(), createMultipartPartUploadUrl: vi.fn(),
  createMultipartUpload: vi.fn(), createObjectUploadUrl: vi.fn(), deleteObject: vi.fn(), deleteObjectCopies: vi.fn(),
  downloadObjectPrefix: vi.fn(), downloadObjectRange: vi.fn(), getObjectMetadata: vi.fn(), getObjectReadUrl: vi.fn(),
  listMultipartUploadParts: vi.fn(), mirrorObjectToReserve: vi.fn(), promoteObjectVersion: vi.fn(), uploadObject: vi.fn()
}));

import { communityRoute } from "../routes/community";

describe("canonical direct-upload media message route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeMute = null;
    mocks.attachments = [];
    mocks.inserted = [];
    mocks.message = null;
    mocks.topic = { id: topicId, isAdminOnly: false, isPublished: true, isLocked: false };
    mocks.manifest = {
      id: manifestId,
      userId,
      uploadToken,
      kind: "image",
      status: "processing",
      finalObjectKey: null,
      quarantineObjectKey: objectKey,
      attachmentId: null,
      consumedAt: null,
      expiresAt: new Date("2099-07-29T12:15:00.000Z"),
      result: {
        kind: "image",
        fileName: "photo.png",
        contentType: "image/png",
        sizeBytes: 1024,
        width: 20,
        height: 10,
        uploadToken,
        objectKey,
        scanStatus: "processing"
      },
      errorCode: null
    };
    mocks.transaction.mockImplementation(async (work: (tx: typeof mocks.database) => Promise<unknown>) => work(mocks.database));
  });

  it("atomically creates the exact media message, consumes its manifest, and returns canonical serialization", async () => {
    const response = await communityRoute.request(`/topics/${topicId}/messages/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadTokens: [uploadToken], replyToMessageId: null })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: { id: messageId, kind: "images", images: [{ scanStatus: "pending", url: null }] }
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ topicId, userId, kind: "images" }),
      expect.objectContaining({ messageId, kind: "image", expiresAt: expect.any(Date), scanStatus: "pending" })
    ]));

    const insertCount = mocks.inserted.length;
    const replay = await communityRoute.request(`/topics/${topicId}/messages/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadTokens: [uploadToken], replyToMessageId: null })
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ message: { id: messageId, kind: "images" } });
    expect(mocks.inserted).toHaveLength(insertCount);
  });

  it("rejects muted authors and locked member topics before creating a message", async () => {
    mocks.activeMute = { id: "mute-1", kind: "permanent", expiresAt: null };
    const muted = await communityRoute.request(`/topics/${topicId}/messages/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadTokens: [uploadToken], replyToMessageId: null })
    });
    expect(muted.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.activeMute = null;
    mocks.topic.isLocked = true;
    const locked = await communityRoute.request(`/topics/${topicId}/messages/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadTokens: [uploadToken], replyToMessageId: null })
    });
    expect(locked.status).toBe(403);
    expect(mocks.inserted).toEqual([]);
  });
});
