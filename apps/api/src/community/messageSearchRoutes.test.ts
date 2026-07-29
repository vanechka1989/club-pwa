import { beforeEach, describe, expect, it, vi } from "vitest";

const topicId = "00000000-0000-4000-8000-000000000010";
const messageId = "00000000-0000-4000-8000-000000000101";
const createdAt = "2026-07-28T12:00:00.123456Z";

function topic() {
  return {
    id: topicId,
    chatId: "00000000-0000-4000-8000-000000000020",
    title: "Общение",
    description: null,
    isPinned: false,
    isLocked: false,
    isPublished: true,
    isAdminOnly: false,
    archivedUntil: null,
    createdByUserId: null,
    createdAt,
    updatedAt: createdAt
  };
}

const mocks = vi.hoisted(() => ({
  role: "member" as "member" | "admin" | "owner",
  membershipStatus: "active" as "active" | "inactive",
  topic: null as ReturnType<typeof topic> | null,
  blockedScopes: new Set<string>(),
  readRateCalls: [] as string[],
  search: vi.fn(),
  loadContext: vi.fn(),
  topicFindFirst: vi.fn(),
  purgeWhere: vi.fn(),
  execute: vi.fn()
}));

vi.mock("../db/client", () => ({
  db: {
    execute: mocks.execute,
    delete: vi.fn(() => ({ where: mocks.purgeWhere })),
    query: {
      clubChatTopics: { findFirst: mocks.topicFindFirst },
      clubMessageReactions: { findMany: vi.fn(async () => []) },
      clubChatMessages: { findFirst: vi.fn(async () => null) },
      clubMessageAttachments: { findMany: vi.fn(async () => []) },
      clubPolls: { findFirst: vi.fn(async () => null) }
    }
  }
}));

vi.mock("../middleware/auth", () => ({
  telegramAuth: async (c: any, next: () => Promise<void>) => {
    c.set("telegramUser", { id: "telegram-user" });
    c.set("userId", "00000000-0000-4000-8000-000000000001");
    c.set("previewRole", mocks.role);
    c.set("previewMembershipStatus", mocks.membershipStatus);
    await next();
  }
}));

vi.mock("../security/persistentWriteRateLimit", () => ({
  persistentWriteRateLimit: async (_c: unknown, next: () => Promise<void>) => next()
}));

vi.mock("../security/persistentCommunityReadRateLimit", () => ({
  persistentCommunityReadRateLimit: async (c: any, next: () => Promise<void>) => {
    const scope = c.req.path.endsWith("/messages/search") ? "search" : c.req.path.endsWith("/context") ? "context" : "other";
    if (scope !== "other") mocks.readRateCalls.push(scope);
    if (mocks.blockedScopes.has(scope)) {
      c.header("Retry-After", "19");
      return c.json({ error: "Too many requests", retryAfterSeconds: 19 }, 429);
    }
    await next();
  }
}));

vi.mock("../admin/roles", () => ({
  getUserRole: vi.fn(async () => mocks.role),
  hasAdminPermission: vi.fn(async () => false),
  isOwnerTelegramId: vi.fn(async () => false)
}));

vi.mock("../community/messageSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../community/messageSearch")>()),
  searchCommunityMessages: mocks.search,
  loadMessageContext: mocks.loadContext
}));

vi.mock("../community/topicStateRepository", () => ({
  topicStateRepository: { getStates: vi.fn(async () => new Map()) }
}));

vi.mock("../community/realtime", () => ({
  publishCommunityChange: vi.fn(),
  subscribeToCommunityChanges: vi.fn(() => () => undefined)
}));

vi.mock("../logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
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
  uploadObject: vi.fn()
}));

import { encodeSearchCursor } from "./messageSearch";
import { communityRoute } from "../routes/community";

describe("secure community message search routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "member";
    mocks.membershipStatus = "active";
    mocks.topic = topic();
    mocks.blockedScopes.clear();
    mocks.readRateCalls.length = 0;
    mocks.topicFindFirst.mockImplementation(async () => mocks.topic);
    mocks.purgeWhere.mockResolvedValue(undefined);
    mocks.search.mockResolvedValue({ results: [], nextCursor: null });
    mocks.loadContext.mockResolvedValue(null);
    mocks.execute.mockResolvedValue([{ now: new Date("2026-07-28T12:00:00.000Z") }]);
  });

  it("decodes a composite cursor and forwards special-character search safely", async () => {
    const cursor = encodeSearchCursor({ createdAt, messageId });
    const q = `%_\\ "Анна"`;
    const response = await communityRoute.request(
      `/messages/search?q=${encodeURIComponent(q)}&before=${encodeURIComponent(cursor)}&limit=7`
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [], nextCursor: null });
    expect(mocks.search).toHaveBeenCalledWith({
      query: q,
      limit: 7,
      role: "member",
      before: { createdAt, messageId }
    });
    expect(mocks.readRateCalls).toEqual(["search"]);
  });

  it("returns a controlled 400 for a semantically malformed opaque cursor", async () => {
    const malformed = Buffer.from(`not-a-date|${messageId}`).toString("base64url");

    const response = await communityRoute.request(
      `/messages/search?q=Анна&before=${encodeURIComponent(malformed)}`
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid message search cursor" });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.purgeWhere).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid search query", "/messages/search?q=а"],
    [
      "invalid search cursor",
      `/messages/search?q=Анна&before=${encodeURIComponent(Buffer.from(`not-a-date|${messageId}`).toString("base64url"))}`
    ],
    [
      "calendar-invalid search cursor",
      `/messages/search?q=Анна&before=${encodeURIComponent(Buffer.from(`2026-02-31T12:00:00.123456Z|${messageId}`).toString("base64url"))}`
    ],
    [
      "PostgreSQL-invalid year-zero search cursor",
      `/messages/search?q=Анна&before=${encodeURIComponent(Buffer.from(`0000-01-01T00:00:00.000000Z|${messageId}`).toString("base64url"))}`
    ],
    ["invalid context window", `/topics/${topicId}/messages/${messageId}/context?before=51`]
  ])("validates %s before consuming read allowance", async (_case, path) => {
    mocks.blockedScopes.add(path.includes("/messages/search") ? "search" : "context");

    const response = await communityRoute.request(path);

    expect(response.status).toBe(400);
    expect(mocks.readRateCalls).toEqual([]);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.loadContext).not.toHaveBeenCalled();
    expect(mocks.purgeWhere).not.toHaveBeenCalled();
  });

  it("rejects inactive membership before search work", async () => {
    mocks.membershipStatus = "inactive";

    const response = await communityRoute.request("/messages/search?q=Анна");

    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.purgeWhere).not.toHaveBeenCalled();
  });

  it("does not expose an inaccessible topic through scoped search", async () => {
    mocks.topic = { ...topic(), isAdminOnly: true };

    const response = await communityRoute.request(`/messages/search?q=Анна&topicId=${topicId}`);

    expect(response.status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each([
    [`/topics/not-a-uuid/messages/${messageId}/context`, "topicId"],
    [`/topics/${topicId}/messages/not-a-uuid/context`, "messageId"]
  ])("returns a controlled 400 for malformed %s", async (path) => {
    const response = await communityRoute.request(path);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid message context path" });
    expect(mocks.topicFindFirst).not.toHaveBeenCalled();
    expect(mocks.loadContext).not.toHaveBeenCalled();
    expect(mocks.purgeWhere).not.toHaveBeenCalled();
    expect(mocks.readRateCalls).toEqual([]);
  });

  it("returns 404 when the exact safe target does not exist", async () => {
    const response = await communityRoute.request(`/topics/${topicId}/messages/${messageId}/context?before=2&after=3`);

    expect(response.status).toBe(404);
    expect(mocks.loadContext).toHaveBeenCalledWith({ topicId, messageId, before: 2, after: 3 });
  });

  it("returns the exact context response contract", async () => {
    mocks.loadContext.mockResolvedValue({ targetMessageId: messageId, messages: [] });

    const response = await communityRoute.request(`/topics/${topicId}/messages/${messageId}/context`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      targetMessageId: messageId,
      messages: [],
      serverTime: "2026-07-28T12:00:00.000Z"
    });
    expect(mocks.readRateCalls).toEqual(["context"]);
  });

  it.each([
    ["search", "/messages/search?q=Анна"],
    ["context", `/topics/${topicId}/messages/${messageId}/context`]
  ])("rejects exhausted %s allowance before database work", async (scope, path) => {
    mocks.blockedScopes.add(scope);

    const response = await communityRoute.request(path);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("19");
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.loadContext).not.toHaveBeenCalled();
    expect(mocks.purgeWhere).not.toHaveBeenCalled();
  });
});
