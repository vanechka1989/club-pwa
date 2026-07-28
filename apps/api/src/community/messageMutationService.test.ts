import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({ db: {} }));
vi.mock("../admin/roles", () => ({ getUserRole: vi.fn(), hasAdminPermission: vi.fn() }));
vi.mock("../membership/getMembership", () => ({ getMembership: vi.fn() }));
vi.mock("../notifications/create", () => ({ createAppNotification: vi.fn() }));
import {
  MessageMutationError,
  createMessageMutationRepository,
  createMessageMutationService,
  type MessageMutationRepository,
  type MessageMutationStore,
  type MutationMessage,
  type MutationTopic,
  type MutationUser,
  type StoredMention
} from "./messageMutationService";
import type { CreateAppNotificationInput } from "../notifications/create";

const senderId = "00000000-0000-4000-8000-000000000001";
const replyUserId = "00000000-0000-4000-8000-000000000002";
const mentionedUserId = "00000000-0000-4000-8000-000000000003";
const allUserId = "00000000-0000-4000-8000-000000000004";
const offUserId = "00000000-0000-4000-8000-000000000005";
const topicId = "00000000-0000-4000-8000-000000000010";
const replyId = "00000000-0000-4000-8000-000000000020";

const topic: MutationTopic = {
  id: topicId,
  title: "Общение",
  isLocked: false,
  isPublished: true,
  isAdminOnly: false
};

const users: MutationUser[] = [
  { id: senderId, telegramId: "sender", firstName: "Иван", username: null, displayName: "Иван", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 100 },
  { id: replyUserId, telegramId: "reply", firstName: "Ольга", username: null, displayName: "Ольга", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 100 },
  { id: mentionedUserId, telegramId: "mention", firstName: "Анна", username: null, displayName: "Анна", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 100 },
  { id: allUserId, telegramId: "all", firstName: "Мария", username: null, displayName: "Мария", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 100 },
  { id: offUserId, telegramId: "off", firstName: "Пётр", username: null, displayName: "Пётр", photoUrl: null, avatarPositionX: 50, avatarPositionY: 50, avatarScale: 100 }
];

function message(overrides: Partial<MutationMessage> = {}): MutationMessage {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    topicId,
    userId: senderId,
    replyToMessageId: null,
    body: "Привет",
    kind: "text",
    isSystem: false,
    status: "visible",
    clientOperationId: "device:1",
    editedAt: null,
    deletedByUserAt: null,
    deletedContentExpiresAt: null,
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
    updatedAt: new Date("2026-07-29T10:00:00.000Z"),
    ...overrides
  };
}

function createFixture() {
  const messages: MutationMessage[] = [];
  const mentions = new Map<string, Array<{ userId: string; start: number; end: number }>>();
  let serverNow = new Date("2026-07-29T10:00:00.000Z");
  let insertCalls = 0;

  const store: MessageMutationStore = {
    getServerNow: vi.fn(async () => new Date(serverNow)),
    findTopicForMutation: vi.fn(async (id) => id === topicId ? topic : null),
    findMessageByOperation: vi.fn(async (userId, operationId) =>
      messages.find((item) => item.userId === userId && item.clientOperationId === operationId) ?? null
    ),
    findMessageForMutation: vi.fn(async (id) => messages.find((item) => item.id === id) ?? null),
    findReplyForMutation: vi.fn(async (id, requestedTopicId) => {
      if (id !== replyId || requestedTopicId !== topicId) return null;
      return message({ id: replyId, userId: replyUserId, body: "Исходное", clientOperationId: "reply:1" });
    }),
    findUsersByIds: vi.fn(async (ids) => users.filter((user) => ids.includes(user.id))),
    insertText: vi.fn(async (input) => {
      insertCalls += 1;
      const existing = messages.find(
        (item) => item.userId === input.userId && item.clientOperationId === input.clientOperationId
      );
      if (existing) return null;
      const created = message({
        id: `00000000-0000-4000-8000-${String(messages.length + 101).padStart(12, "0")}`,
        body: input.body,
        replyToMessageId: input.replyToMessageId,
        clientOperationId: input.clientOperationId,
        createdAt: new Date(serverNow),
        updatedAt: new Date(serverNow)
      });
      messages.push(created);
      return created;
    }),
    getMentions: vi.fn(async (messageId) => mentions.get(messageId) ?? []),
    insertMentions: vi.fn(async (messageId: string, values: StoredMention[]) => {
      mentions.set(messageId, values.map((value) => ({ ...value })));
    }),
    replaceMentions: vi.fn(async (messageId: string, values: StoredMention[]) => {
      mentions.set(messageId, values.map((value) => ({ ...value })));
    }),
    updateText: vi.fn(async (id, body, editedAt) => {
      const current = messages.find((item) => item.id === id)!;
      current.body = body;
      current.editedAt = editedAt;
      current.updatedAt = editedAt;
      return current;
    }),
    markDeletedByAuthor: vi.fn(async (id, deletedAt, expiresAt) => {
      const current = messages.find((item) => item.id === id)!;
      current.deletedByUserAt = deletedAt;
      current.deletedContentExpiresAt = expiresAt;
      current.updatedAt = deletedAt;
      return current;
    })
  };

  const repository: MessageMutationRepository = {
    transaction: async (work) => work(store),
    listParticipantCandidates: vi.fn(async () => users),
    listNotificationCandidates: vi.fn(async () => [
      { user: users[1]!, mode: "mentions" as const },
      { user: users[2]!, mode: "mentions" as const },
      { user: users[3]!, mode: "all" as const },
      { user: users[4]!, mode: "off" as const },
      { user: users[0]!, mode: "all" as const }
    ])
  };
  const createNotification = vi.fn<(input: CreateAppNotificationInput) => Promise<unknown>>(
    async () => ({ id: "notification" })
  );
  const publishChange = vi.fn();
  const canUserAccessTopic = vi.fn<(user: MutationUser, topic: MutationTopic) => Promise<boolean>>(
    async () => true
  );
  const service = createMessageMutationService({
    repository,
    createNotification,
    canUserAccessTopic,
    publishChange
  });

  return {
    service,
    store,
    repository,
    messages,
    mentions,
    createNotification,
    publishChange,
    canUserAccessTopic,
    get insertCalls() { return insertCalls; },
    setServerNow(value: string) { serverNow = new Date(value); }
  };
}

function createInput(overrides: Partial<Parameters<ReturnType<typeof createMessageMutationService>["createText"]>[0]> = {}) {
  return {
    topicId,
    userId: senderId,
    role: "member" as const,
    body: "Привет",
    replyToMessageId: null,
    clientOperationId: "device:1",
    mentions: [],
    ...overrides
  };
}

describe("message mutation service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the same message for an idempotent retry without inserting twice", async () => {
    const fixture = createFixture();

    const first = await fixture.service.createText(createInput());
    const retry = await fixture.service.createText(createInput());

    expect(retry.message.id).toBe(first.message.id);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(fixture.insertCalls).toBe(1);
    expect(fixture.createNotification).toHaveBeenCalledTimes(2);
    expect(fixture.createNotification.mock.calls.every(([input]) => input.deduplicate)).toBe(true);
    expect(fixture.publishChange).toHaveBeenCalledTimes(1);
    expect(fixture.publishChange).toHaveBeenCalledWith(topicId);
  });

  it("lets a retry resume deduplicated notification fanout after the message commit", async () => {
    const fixture = createFixture();
    fixture.createNotification.mockRejectedValueOnce(new Error("notification database unavailable"));

    await expect(fixture.service.createText(createInput())).rejects.toThrow("notification database unavailable");
    await expect(fixture.service.createText(createInput())).resolves.toMatchObject({ created: false });

    expect(fixture.insertCalls).toBe(1);
    expect(fixture.createNotification).toHaveBeenCalledTimes(2);
    expect(fixture.publishChange).toHaveBeenCalledTimes(1);
  });

  it("rejects reusing an operation id with a different payload", async () => {
    const fixture = createFixture();
    await fixture.service.createText(createInput());

    await expect(fixture.service.createText(createInput({ body: "Другой текст" }))).rejects.toMatchObject({
      code: "operation_conflict",
      status: 409
    });
  });

  it("validates a reply in the same topic and rejects deleted replies", async () => {
    const fixture = createFixture();
    fixture.store.findReplyForMutation = vi.fn(async () =>
      message({ id: replyId, userId: replyUserId, deletedByUserAt: new Date("2026-07-29T09:00:00Z") })
    );

    await expect(
      fixture.service.createText(createInput({ replyToMessageId: replyId }))
    ).rejects.toMatchObject({ code: "reply_not_available", status: 400 });
  });

  it("requires selected mention ranges to match an accessible authoritative user", async () => {
    const fixture = createFixture();
    fixture.canUserAccessTopic.mockImplementation(async (user: MutationUser) => user.id !== mentionedUserId);

    await expect(
      fixture.service.createText(createInput({
        body: "Привет, @Анна",
        mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 8, end: 13 }]
      }))
    ).rejects.toMatchObject({ code: "invalid_mention", status: 400 });

    fixture.canUserAccessTopic.mockResolvedValue(true);
    await expect(
      fixture.service.createText(createInput({
        clientOperationId: "device:2",
        body: "Привет, @Подмена",
        mentions: [{ userId: mentionedUserId, displayName: "Подмена", start: 8, end: 16 }]
      }))
    ).rejects.toMatchObject({ code: "invalid_mention", status: 400 });
  });

  it("fans out once by reply, mention, and all modes while suppressing sender and off", async () => {
    const fixture = createFixture();

    await fixture.service.createText(createInput({
      body: "@Анна ответ",
      replyToMessageId: replyId,
      mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }]
    }));

    expect(fixture.createNotification.mock.calls.map(([input]) => ({
      userId: input.userId,
      source: input.source,
      sourceId: input.sourceId,
      deduplicate: input.deduplicate
    }))).toEqual([
      { userId: replyUserId, source: "community_reply", sourceId: expect.any(String), deduplicate: true },
      { userId: mentionedUserId, source: "community_mention", sourceId: expect.any(String), deduplicate: true },
      { userId: allUserId, source: "community_all", sourceId: expect.any(String), deduplicate: true }
    ]);
  });

  it("uses the database clock for the exact fifteen-minute author window", async () => {
    const fixture = createFixture();
    fixture.messages.push(message());

    fixture.setServerNow("2026-07-29T10:14:59.999Z");
    await expect(fixture.service.editText({
      messageId: fixture.messages[0]!.id,
      userId: senderId,
      role: "member",
      body: "Исправлено",
      mentions: []
    })).resolves.toMatchObject({ message: { body: "Исправлено" } });

    fixture.messages[0]!.editedAt = null;
    fixture.setServerNow("2026-07-29T10:15:00.001Z");
    await expect(fixture.service.editText({
      messageId: fixture.messages[0]!.id,
      userId: senderId,
      role: "member",
      body: "Поздно",
      mentions: []
    })).rejects.toMatchObject({ code: "mutation_window_expired", status: 409 });
  });

  it("publishes edit and delete changes immediately after their transactions commit", async () => {
    const editFixture = createFixture();
    editFixture.messages.push(message());

    await editFixture.service.editText({
      messageId: editFixture.messages[0]!.id,
      userId: senderId,
      role: "member",
      body: "Исправлено",
      mentions: []
    });

    expect(editFixture.publishChange).toHaveBeenCalledOnce();
    expect(editFixture.publishChange).toHaveBeenCalledWith(topicId);

    const deleteFixture = createFixture();
    deleteFixture.messages.push(message());

    await deleteFixture.service.deleteMessage({
      messageId: deleteFixture.messages[0]!.id,
      userId: senderId,
      role: "member"
    });

    expect(deleteFixture.publishChange).toHaveBeenCalledOnce();
    expect(deleteFixture.publishChange).toHaveBeenCalledWith(topicId);
  });

  it("does not let moderators edit or delete another author's message", async () => {
    const fixture = createFixture();
    fixture.messages.push(message({ userId: replyUserId }));

    await expect(fixture.service.deleteMessage({
      messageId: fixture.messages[0]!.id,
      userId: senderId,
      role: "admin"
    })).rejects.toBeInstanceOf(MessageMutationError);
  });

  it("creates an author tombstone with a thirty-day expiry without changing moderation status", async () => {
    const fixture = createFixture();
    fixture.messages.push(message());
    fixture.setServerNow("2026-07-29T10:14:59.999Z");

    const result = await fixture.service.deleteMessage({
      messageId: fixture.messages[0]!.id,
      userId: senderId,
      role: "member"
    });

    expect(result.message).toMatchObject({
      body: "Привет",
      status: "visible",
      deletedByUserAt: new Date("2026-07-29T10:14:59.999Z"),
      deletedContentExpiresAt: new Date("2026-08-28T10:14:59.999Z")
    });
  });
});

describe("message mutation PostgreSQL repository locking", () => {
  it("locks a reply row before loading it for validation", async () => {
    const execute = vi.fn(async () => []);
    const findFirst = vi.fn(async () => message({ id: replyId, userId: replyUserId }));
    const transaction = {
      execute,
      query: { clubChatMessages: { findFirst } }
    };
    const database = {
      transaction: vi.fn(async (work: (value: typeof transaction) => Promise<unknown>) => work(transaction))
    };
    const repository = createMessageMutationRepository(database as never);

    await repository.transaction((store) => store.findReplyForMutation(replyId, topicId));

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[0]!);
  });
});
