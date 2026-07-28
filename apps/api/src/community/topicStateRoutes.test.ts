import { beforeEach, describe, expect, it, vi } from "vitest";

const topicId = "00000000-0000-0000-0000-000000000001";
const messageId = "00000000-0000-0000-0000-000000000002";
const state = {
  unreadCount: 3,
  lastReadMessageId: messageId,
  notificationMode: "mentions" as const
};

function topic(id: string) {
  return {
    id,
    chatId: "00000000-0000-0000-0000-000000000020",
    title: `Topic ${id.at(-1)}`,
    description: null,
    isPinned: false,
    isLocked: false,
    isPublished: true,
    isAdminOnly: false,
    archivedUntil: null,
    createdByUserId: null,
    createdAt: new Date("2026-07-28T12:00:00.000Z"),
    updatedAt: new Date("2026-07-28T12:00:00.000Z")
  };
}

const mocks = vi.hoisted(() => ({
  topic: topic("00000000-0000-0000-0000-000000000001"),
  topics: [] as ReturnType<typeof topic>[],
  markRead: vi.fn(),
  setNotificationMode: vi.fn(),
  getState: vi.fn(),
  getStates: vi.fn(),
  publishCommunityChange: vi.fn()
}));

vi.mock("../db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(async () => [])
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(async () => [])
          }))
        }))
      }))
    })),
    query: {
      clubChats: {
        findFirst: vi.fn(async () => ({
          id: "00000000-0000-0000-0000-000000000020",
          isPublished: true
        }))
      },
      clubChatTopics: {
        findFirst: vi.fn(async () => mocks.topic),
        findMany: vi.fn(async () => mocks.topics)
      }
    }
  }
}));

vi.mock("../middleware/auth", () => ({
  telegramAuth: async (c: any, next: () => Promise<void>) => {
    c.set("telegramUser", { id: "telegram-user" });
    c.set("userId", "00000000-0000-0000-0000-000000000010");
    c.set("previewRole", null);
    c.set("previewMembershipStatus", "active");
    await next();
  }
}));

vi.mock("../security/persistentWriteRateLimit", () => ({
  persistentWriteRateLimit: async (_c: unknown, next: () => Promise<void>) => next()
}));

vi.mock("../admin/roles", () => ({
  getUserRole: vi.fn(async () => "member"),
  hasAdminPermission: vi.fn(async () => false),
  isOwnerTelegramId: vi.fn(async () => false)
}));

vi.mock("../community/topicStateRepository", () => ({
  topicStateRepository: {
    markRead: mocks.markRead,
    setNotificationMode: mocks.setNotificationMode,
    getState: mocks.getState,
    getStates: mocks.getStates
  }
}));

vi.mock("../community/realtime", () => ({
  publishCommunityChange: mocks.publishCommunityChange,
  subscribeToCommunityChanges: vi.fn(() => () => undefined)
}));

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock("../notifications/create", () => ({
  createAppNotification: vi.fn()
}));

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
  uploadObject: vi.fn()
}));

import { communityRoute } from "../routes/community";

describe("community topic state routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.topic.isAdminOnly = false;
    mocks.topic.isPublished = true;
    mocks.topics = [];
    mocks.markRead.mockResolvedValue(messageId);
    mocks.setNotificationMode.mockResolvedValue(undefined);
    mocks.getState.mockResolvedValue(state);
    mocks.getStates.mockResolvedValue(new Map());
  });

  it("marks an accessible topic read and returns authoritative state", async () => {
    const response = await communityRoute.request(`/topics/${topicId}/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(state);
    expect(mocks.markRead).toHaveBeenCalledWith({
      userId: "00000000-0000-0000-0000-000000000010",
      topicId,
      messageId
    });
    expect(mocks.publishCommunityChange).toHaveBeenCalledWith(topicId);
  });

  it("does not let a member read an admin-only topic", async () => {
    mocks.topic.isAdminOnly = true;

    const response = await communityRoute.request(`/topics/${topicId}/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId })
    });

    expect(response.status).toBe(404);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("updates notification mode and returns authoritative state", async () => {
    const response = await communityRoute.request(`/topics/${topicId}/notification-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "off" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(state);
    expect(mocks.setNotificationMode).toHaveBeenCalledWith({
      userId: "00000000-0000-0000-0000-000000000010",
      topicId,
      mode: "off"
    });
    expect(mocks.publishCommunityChange).toHaveBeenCalledWith(topicId);
  });

  it("loads read and notification state once for a list of topics", async () => {
    const secondTopicId = "00000000-0000-0000-0000-000000000003";
    mocks.topics = [mocks.topic, topic(secondTopicId)];

    const response = await communityRoute.request("/chats/00000000-0000-0000-0000-000000000020/topics");

    expect(response.status).toBe(200);
    expect(mocks.getStates).toHaveBeenCalledTimes(1);
    expect(mocks.getStates).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000010",
      [topicId, secondTopicId]
    );
  });
});
