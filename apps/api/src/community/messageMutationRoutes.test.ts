import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubMessagesResponseSchema } from "@club/shared";

const topicId = "00000000-0000-4000-8000-000000000010";
const messageId = "00000000-0000-4000-8000-000000000100";
const userId = "00000000-0000-4000-8000-000000000001";
const mentionedUserId = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({
  role: "member" as "member" | "admin" | "owner",
  created: true,
  deleted: false,
  deleteReplyOnSecondRead: false,
  messageReadCount: 0,
  pollFound: false,
  attachmentExpiresAt: null as Date | null,
  attachmentDeletedAt: null as Date | null,
  createText: vi.fn(),
  editText: vi.fn(),
  deleteMessage: vi.fn(),
  findMessages: vi.fn(),
  findParticipants: vi.fn(),
  publish: vi.fn(),
  transaction: vi.fn(),
  getObjectReadUrl: vi.fn(async () => "https://private.test/secret.webp")
}));

const serverNow = new Date("2026-07-29T10:10:00.000Z");

const topic = {
  id: topicId,
  chatId: "00000000-0000-4000-8000-000000000011",
  title: "Общение",
  description: null,
  isPinned: false,
  isLocked: false,
  isPublished: true,
  isAdminOnly: false,
  archivedUntil: null,
  createdByUserId: null,
  createdAt: new Date("2026-07-29T10:00:00.000Z"),
  updatedAt: new Date("2026-07-29T10:00:00.000Z")
};

function dbMessage(deleted = mocks.deleted) {
  return {
    id: messageId,
    topicId,
    userId,
    replyToMessageId: null,
    body: "original secret",
    kind: "images",
    isSystem: false,
    status: "visible",
    moderatedByUserId: null,
    moderatedAt: null,
    moderationReason: null,
    pinnedAt: null,
    pinnedByUserId: null,
    purgeAt: null,
    clientOperationId: "device:1",
    editedAt: null,
    deletedByUserAt: deleted ? new Date("2026-07-29T10:05:00.000Z") : null,
    deletedContentExpiresAt: deleted ? new Date("2999-08-28T10:05:00.000Z") : null,
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
    updatedAt: new Date("2026-07-29T10:05:00.000Z"),
    user: {
      id: userId,
      telegramId: "web:user",
      firstName: "Иван",
      username: null,
      displayName: "Иван",
      photoUrl: null,
      avatarPositionX: 50,
      avatarPositionY: 50,
      avatarScale: 100
    }
  };
}

vi.mock("../db/client", () => {
  const database = {
    execute: vi.fn(async () => [{ now: serverNow }]),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    query: {
      clubChatTopics: { findFirst: vi.fn(async () => topic) },
      clubChatMessages: {
        findFirst: vi.fn(async () => {
          mocks.messageReadCount += 1;
          return dbMessage(mocks.deleted || (mocks.deleteReplyOnSecondRead && mocks.messageReadCount >= 2));
        }),
        findMany: mocks.findMessages
      },
      clubMessageReactions: { findMany: vi.fn(async () => []) },
      clubMessageMentions: {
        findMany: vi.fn(async () => [{
          messageId,
          userId: mentionedUserId,
          startOffset: 0,
          endOffset: 5,
          user: {
            id: mentionedUserId,
            telegramId: "web:mention",
            firstName: "Анна",
            username: null,
            displayName: "Анна",
            photoUrl: null,
            avatarPositionX: 50,
            avatarPositionY: 50,
            avatarScale: 100
          }
        }])
      },
      clubMessageAttachments: {
        findMany: vi.fn(async () => [{
          id: "attachment-1",
          messageId,
          kind: "image",
          objectKey: "community/images/secret.webp",
          fileName: "secret.webp",
          contentType: "image/webp",
          sizeBytes: 10,
          durationSeconds: null,
          width: 100,
          height: 100,
          sortOrder: 0,
          expiresAt: mocks.attachmentExpiresAt,
          deletedAt: mocks.attachmentDeletedAt,
          scanStatus: "ready",
          scannedAt: null,
          scanError: null,
          createdAt: new Date("2026-07-29T10:00:00.000Z")
        }])
      },
      clubPolls: {
        findFirst: vi.fn(async () => mocks.pollFound ? {
          id: "00000000-0000-4000-8000-000000000200",
          messageId,
          question: "Выбор?",
          allowsMultiple: false,
          isAnonymous: true,
          closedAt: null,
          closesAt: null,
          options: [{ id: "00000000-0000-4000-8000-000000000201", text: "Да", sortOrder: 0 }],
          message: { ...dbMessage(), topic }
        } : null)
      },
      users: { findFirst: vi.fn(async () => dbMessage().user) }
    }
  };
  mocks.transaction.mockImplementation(async (work) => work(database));
  return { db: { ...database, transaction: mocks.transaction } };
});

vi.mock("../middleware/auth", () => ({
  telegramAuth: async (c: any, next: () => Promise<void>) => {
    c.set("telegramUser", { id: "web:user" });
    c.set("userId", userId);
    c.set("previewRole", mocks.role);
    c.set("previewMembershipStatus", "active");
    await next();
  }
}));
vi.mock("../security/persistentWriteRateLimit", () => ({
  persistentWriteRateLimit: async (_c: unknown, next: () => Promise<void>) => next()
}));
vi.mock("../security/persistentCommunityReadRateLimit", () => ({
  persistentCommunityReadRateLimit: async (_c: unknown, next: () => Promise<void>) => next()
}));
vi.mock("../admin/roles", () => ({
  getUserRole: vi.fn(async () => mocks.role),
  hasAdminPermission: vi.fn(async () => mocks.role !== "member"),
  isOwnerTelegramId: vi.fn(async () => mocks.role === "owner")
}));
vi.mock("../moderation/mutes", () => ({ getActiveMute: vi.fn(async () => null) }));
vi.mock("../community/messageMutationService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../community/messageMutationService")>()),
  messageMutationService: {
    createText: mocks.createText,
    editText: mocks.editText,
    deleteMessage: mocks.deleteMessage,
    findParticipants: mocks.findParticipants
  }
}));
vi.mock("../community/topicStateRepository", () => ({
  topicStateRepository: { getStates: vi.fn(async () => new Map()) }
}));
vi.mock("../community/realtime", () => ({
  publishCommunityChange: mocks.publish,
  subscribeToCommunityChanges: vi.fn(() => () => undefined)
}));
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
  getObjectReadUrl: mocks.getObjectReadUrl,
  listMultipartUploadParts: vi.fn(),
  mirrorObjectToReserve: vi.fn(),
  promoteObjectVersion: vi.fn(),
  uploadObject: vi.fn()
}));

import { communityRoute } from "../routes/community";

describe("community message mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "member";
    mocks.created = true;
    mocks.deleted = false;
    mocks.deleteReplyOnSecondRead = false;
    mocks.messageReadCount = 0;
    mocks.pollFound = false;
    mocks.attachmentExpiresAt = null;
    mocks.attachmentDeletedAt = null;
    mocks.createText.mockImplementation(async () => {
      if (mocks.created) mocks.publish(topicId);
      return { message: dbMessage(), created: mocks.created };
    });
    mocks.editText.mockImplementation(async () => {
      mocks.publish(topicId);
      return { message: dbMessage() };
    });
    mocks.deleteMessage.mockImplementation(async () => {
      mocks.publish(topicId);
      return { message: dbMessage() };
    });
    mocks.findParticipants.mockResolvedValue([dbMessage().user]);
    mocks.findMessages.mockImplementation(async () => [dbMessage()]);
  });

  it("clamps an oversized message page request before executing the repository query", async () => {
    mocks.findMessages.mockResolvedValue(Array.from({ length: 101 }, () => dbMessage()));

    const response = await communityRoute.request(`/topics/${topicId}/messages?limit=10000`);
    const payload = clubMessagesResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.messages).toHaveLength(100);
    expect(mocks.findMessages).toHaveBeenCalledWith(expect.objectContaining({ limit: 101 }));
  });

  it("refuses to sign a ready attachment after its retention deadline", async () => {
    mocks.attachmentExpiresAt = new Date(serverNow.getTime());

    const response = await communityRoute.request(`/topics/${topicId}/messages`);
    const payload = clubMessagesResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.messages[0]?.images[0]?.url).toBeNull();
    expect(mocks.getObjectReadUrl).not.toHaveBeenCalled();
  });

  it("caps a fresh signed URL to the remaining retention window", async () => {
    mocks.attachmentExpiresAt = new Date(serverNow.getTime() + 65_500);

    const response = await communityRoute.request(`/topics/${topicId}/messages`);
    const payload = clubMessagesResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.messages[0]?.images[0]?.url).toBe("https://private.test/secret.webp");
    expect(mocks.getObjectReadUrl).toHaveBeenCalledWith(
      "community/images/secret.webp",
      "primary",
      { expiresInSeconds: 65 }
    );
  });

  it("passes the idempotency key and selected mentions to the transaction service", async () => {
    const response = await communityRoute.request(`/topics/${topicId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "@Анна привет",
        replyToMessageId: null,
        clientOperationId: "device:1",
        mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }]
      })
    });

    expect(response.status).toBe(200);
    expect(mocks.createText).toHaveBeenCalledWith({
      topicId,
      userId,
      role: "member",
      body: "@Анна привет",
      replyToMessageId: null,
      clientOperationId: "device:1",
      mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }]
    });
    expect(mocks.publish).toHaveBeenCalledWith(topicId);
  });

  it("does not publish realtime again for an idempotent retry", async () => {
    mocks.created = false;
    const response = await communityRoute.request(`/topics/${topicId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Привет", clientOperationId: "device:1", mentions: [] })
    });

    expect(response.status).toBe(200);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("routes edit, delete, and participant suggestions through the secured service", async () => {
    const edit = await communityRoute.request(`/messages/${messageId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Исправлено", mentions: [] })
    });
    const remove = await communityRoute.request(`/messages/${messageId}`, { method: "DELETE" });
    const participants = await communityRoute.request("/participants?q=Ан&limit=20");

    expect(edit.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(participants.status).toBe(200);
    expect(mocks.editText).toHaveBeenCalledWith({ messageId, userId, role: "member", body: "Исправлено", mentions: [] });
    expect(mocks.deleteMessage).toHaveBeenCalledWith({ messageId, userId, role: "member" });
    expect(mocks.findParticipants).toHaveBeenCalledWith({ query: "Ан", limit: 20 });
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenCalledWith(topicId);
  });

  it("returns a content-free tombstone to members while moderators retain content before expiry", async () => {
    mocks.deleted = true;
    const memberResponse = await communityRoute.request(`/topics/${topicId}/messages`);
    const memberPayload = clubMessagesResponseSchema.parse(await memberResponse.json());

    expect(memberPayload.messages[0]).toMatchObject({
      body: "Сообщение удалено",
      images: [],
      mentions: [],
      deletedByUserAt: null,
      contentRedacted: true,
      authorMutation: { canEdit: false, canDelete: false, allowedUntil: null }
    });
    expect(memberPayload.serverTime).toBe(serverNow.toISOString());
    expect(JSON.stringify(memberPayload)).not.toContain("original secret");
    expect(JSON.stringify(memberPayload)).not.toContain("secret.webp");

    mocks.role = "admin";
    const moderatorResponse = await communityRoute.request(`/topics/${topicId}/messages`);
    const moderatorPayload = clubMessagesResponseSchema.parse(await moderatorResponse.json());
    expect(moderatorPayload.messages[0]).toMatchObject({
      body: "original secret",
      deletedByUserAt: "2026-07-29T10:05:00.000Z",
      contentRedacted: false
    });
    expect(moderatorPayload.messages[0]?.images).toHaveLength(1);
  });

  it("returns server-derived delete capability for an own media message", async () => {
    const response = await communityRoute.request(`/topics/${topicId}/messages`);
    const payload = await response.json() as {
      serverTime: string;
      messages: Array<{ authorMutation: unknown }>;
    };

    expect(payload.serverTime).toBe(serverNow.toISOString());
    expect(payload.messages[0]?.authorMutation).toEqual({
      canEdit: false,
      canDelete: true,
      allowedUntil: "2026-07-29T10:15:00.000Z"
    });
  });

  it("rejects replies to author-deleted messages for non-text message kinds too", async () => {
    mocks.deleted = true;

    const response = await communityRoute.request(`/topics/${topicId}/messages/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "Выбор?",
        options: ["Да", "Нет"],
        allowsMultiple: false,
        isAnonymous: true,
        replyToMessageId: messageId
      })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Reply message is unavailable" });
  });

  it("rejects votes, pinning, and reactions for an author-deleted tombstone", async () => {
    mocks.deleted = true;
    mocks.pollFound = true;
    mocks.role = "admin";

    const vote = await communityRoute.request("/polls/00000000-0000-4000-8000-000000000200/votes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionIds: ["00000000-0000-4000-8000-000000000201"] })
    });
    const pin = await communityRoute.request(`/messages/${messageId}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: true })
    });
    const reaction = await communityRoute.request(`/messages/${messageId}/reaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reaction: null })
    });

    expect(vote.status).toBe(409);
    expect(pin.status).toBe(409);
    expect(reaction.status).toBe(409);
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("revalidates a non-text reply under a transaction lock before insertion", async () => {
    mocks.deleteReplyOnSecondRead = true;

    const response = await communityRoute.request(`/topics/${topicId}/messages/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "Выбор?",
        options: ["Да", "Нет"],
        allowsMultiple: false,
        isAnonymous: true,
        replyToMessageId: messageId
      })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Reply message is unavailable" });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
