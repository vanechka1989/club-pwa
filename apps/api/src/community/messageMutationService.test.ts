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

type NotificationOptions = { activeCommunityMessageId?: string };

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
    createRequestFingerprint: null,
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
        createRequestFingerprint: (input as typeof input & { createRequestFingerprint?: string }).createRequestFingerprint ?? null,
        createdAt: new Date(serverNow),
        updatedAt: new Date(serverNow)
      });
      messages.push(created);
      return created;
    }),
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
    }),
    deleteMessageNotifications: vi.fn(async () => undefined)
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
    ]),
    enqueueNotifications: vi.fn(async (input) => {
      const candidates = await repository.listNotificationCandidates(input.topicId, [
        ...(input.replyUserId ? [input.replyUserId] : []),
        ...input.mentionUserIds
      ]);
      for (const candidate of candidates) {
        const replied = candidate.user.id === input.replyUserId;
        const mentioned = input.mentionUserIds.includes(candidate.user.id);
        if (candidate.user.id === input.senderUserId || candidate.mode === "off") continue;
        if (candidate.mode !== "all" && !replied && !mentioned) continue;
        if (!(await canUserAccessTopic(candidate.user, topic))) continue;
        const reason = replied ? "reply" : mentioned ? "mention" : "all";
        const title = reason === "reply"
          ? `Ответ в чате: ${input.topicTitle}`
          : reason === "mention"
            ? `Вас упомянули: ${input.topicTitle}`
            : `Новое сообщение: ${input.topicTitle}`;
        const body = reason === "reply"
          ? `Новый ответ в чате "${input.topicTitle}". Автор: ${input.senderName}.`
          : reason === "mention"
            ? `Новое упоминание в чате "${input.topicTitle}". Автор: ${input.senderName}.`
            : `Новое сообщение в чате "${input.topicTitle}". Автор: ${input.senderName}.`;
        await createNotification({
          userId: candidate.user.id,
          kind: "client",
          title,
          body,
          source: `community_${reason}`,
          sourceId: input.messageId,
          pushUrl: `/community/topics/${input.topicId}?message=${input.messageId}`,
          deduplicate: true
        }, { activeCommunityMessageId: input.messageId });
      }
    })
  };
  const createNotification = vi.fn<(
    input: CreateAppNotificationInput,
    options?: NotificationOptions
  ) => Promise<unknown>>(
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

  it("recognizes the original operation after an edit and rejects the edited payload as a retry", async () => {
    const fixture = createFixture();
    const original = createInput();
    const first = await fixture.service.createText(original);

    await fixture.service.editText({
      messageId: first.message.id,
      userId: senderId,
      role: "member",
      body: "Исправлено",
      mentions: []
    });

    await expect(fixture.service.createText(original)).resolves.toMatchObject({
      created: false,
      message: { id: first.message.id }
    });
    await expect(fixture.service.createText(createInput({ body: "Исправлено" }))).rejects.toMatchObject({
      code: "operation_conflict",
      status: 409
    });
  });

  it("recognizes only the original operation after deletion and final content purge", async () => {
    const fixture = createFixture();
    const original = createInput({ body: "@Анна привет", mentions: [
      { userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }
    ] });
    const first = await fixture.service.createText(original);

    await fixture.service.deleteMessage({ messageId: first.message.id, userId: senderId, role: "member" });
    fixture.createNotification.mockClear();
    await expect(fixture.service.createText(original)).resolves.toMatchObject({ created: false });
    expect(fixture.createNotification).not.toHaveBeenCalled();

    first.message.body = "";
    first.message.deletedContentExpiresAt = null;
    fixture.mentions.delete(first.message.id);

    await expect(fixture.service.createText(original)).resolves.toMatchObject({ created: false });
    await expect(fixture.service.createText(createInput({ body: "", mentions: [] }))).rejects.toMatchObject({
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
      deduplicate: input.deduplicate,
      title: input.title,
      body: input.body
    }))).toEqual([
      {
        userId: replyUserId,
        source: "community_reply",
        sourceId: expect.any(String),
        deduplicate: true,
        title: "Ответ в чате: Общение",
        body: "Новый ответ в чате \"Общение\". Автор: Иван."
      },
      {
        userId: mentionedUserId,
        source: "community_mention",
        sourceId: expect.any(String),
        deduplicate: true,
        title: "Вас упомянули: Общение",
        body: "Новое упоминание в чате \"Общение\". Автор: Иван."
      },
      {
        userId: allUserId,
        source: "community_all",
        sourceId: expect.any(String),
        deduplicate: true,
        title: "Новое сообщение: Общение",
        body: "Новое сообщение в чате \"Общение\". Автор: Иван."
      }
    ]);
    expect(JSON.stringify(fixture.createNotification.mock.calls)).not.toContain("@Анна ответ");
  });

  it("does not persist or push later recipients when author deletion commits during fanout", async () => {
    const fixture = createFixture();
    const persisted = new Set<string>();
    const pushed: string[] = [];
    let notificationCall = 0;
    fixture.store.deleteMessageNotifications = vi.fn(async () => {
      persisted.clear();
    });
    fixture.createNotification.mockImplementation(async (input, options) => {
      const current = fixture.messages.find((item) => item.id === input.sourceId);
      if (options?.activeCommunityMessageId &&
          (!current || current.status !== "visible" || current.deletedByUserAt)) {
        return null;
      }
      persisted.add(`${input.userId}:${input.source}`);
      pushed.push(input.userId);
      notificationCall += 1;
      if (notificationCall === 1) {
        await fixture.service.deleteMessage({
          messageId: input.sourceId!,
          userId: senderId,
          role: "member"
        });
      }
      return { id: `notification-${notificationCall}` };
    });

    await fixture.service.createText(createInput({
      body: "@Анна ответ",
      replyToMessageId: replyId,
      mentions: [{ userId: mentionedUserId, displayName: "Анна", start: 0, end: 5 }]
    }));

    expect(persisted).toEqual(new Set());
    expect(pushed).toEqual([replyUserId]);
    expect(fixture.createNotification).toHaveBeenCalledTimes(3);
    expect(fixture.createNotification.mock.calls.every(([, options]) =>
      options?.activeCommunityMessageId === fixture.messages[0]?.id)).toBe(true);
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
    expect(fixture.store.deleteMessageNotifications).toHaveBeenCalledWith(result.message.id);
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
