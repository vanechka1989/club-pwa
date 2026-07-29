import type { ClubMessage, ClubTopic, CommunityTopicState } from "@club/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommunityTopicState } from "./useCommunityTopicState";

const topicId = "00000000-0000-4000-8000-000000000010";
const olderId = "00000000-0000-4000-8000-000000000101";
const newerId = "00000000-0000-4000-8000-000000000102";

function message(id: string, createdAt: string): ClubMessage {
  return {
    id,
    topicId,
    body: id,
    kind: "text",
    voice: null,
    images: [],
    video: null,
    document: null,
    poll: null,
    isSystem: false,
    status: "visible",
    author: {
      id: "user-2",
      telegramId: "2",
      firstName: "Анна",
      username: null,
      photoUrl: null,
      avatarPositionX: 50,
      avatarPositionY: 50,
      avatarScale: 1
    },
    replyTo: null,
    likesCount: 0,
    dislikesCount: 0,
    reactionCounts: [],
    myReaction: null,
    authorMute: null,
    pinnedAt: null,
    editedAt: null,
    deletedByUserAt: null,
    contentRedacted: false,
    authorMutation: { canEdit: false, canDelete: false, allowedUntil: null },
    clientOperationId: null,
    mentions: [],
    createdAt
  };
}

const messages = [
  message(newerId, "2026-07-29T12:01:00.000Z"),
  message(olderId, "2026-07-29T12:00:00.000Z")
];

function topic(overrides: Partial<ClubTopic> = {}): ClubTopic {
  return {
    id: topicId,
    chatId: "chat-1",
    title: "Тема",
    description: null,
    isPinned: false,
    isLocked: false,
    isPublished: true,
    isAdminOnly: false,
    archivedUntil: null,
    messagesCount: 2,
    latestReplyToMeAt: null,
    unreadCount: 2,
    notificationMode: "all",
    createdAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("authoritative community topic state", () => {
  it("replaces unread and notification settings from each server topic snapshot", () => {
    const state = useCommunityTopicState({ markRead: vi.fn() });

    state.syncTopics([topic()]);
    expect(state.topicStates.value[topicId]).toEqual({
      unreadCount: 2,
      lastReadMessageId: null,
      notificationMode: "all"
    });

    state.syncTopics([topic({ unreadCount: 0, notificationMode: "off" })]);
    expect(state.topicStates.value[topicId]).toEqual({
      unreadCount: 0,
      lastReadMessageId: null,
      notificationMode: "off"
    });
    state.dispose();
  });

  it("debounces visible reads for 400ms and only advances to newer messages", async () => {
    vi.useFakeTimers();
    const firstResponse: CommunityTopicState = {
      unreadCount: 1,
      lastReadMessageId: olderId,
      notificationMode: "mentions"
    };
    const response: CommunityTopicState = {
      unreadCount: 0,
      lastReadMessageId: newerId,
      notificationMode: "mentions"
    };
    const markRead = vi.fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(response);
    const state = useCommunityTopicState({ markRead });
    state.selectTopic(topicId, messages);

    state.markVisibleMessageRead(olderId);
    await vi.advanceTimersByTimeAsync(399);
    expect(markRead).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(markRead).toHaveBeenCalledWith(topicId, olderId);

    state.markVisibleMessageRead(olderId);
    await vi.advanceTimersByTimeAsync(400);
    expect(markRead).toHaveBeenCalledTimes(1);

    state.markVisibleMessageRead(newerId);
    await vi.advanceTimersByTimeAsync(400);
    expect(markRead).toHaveBeenLastCalledWith(topicId, newerId);
    expect(state.topicStates.value[topicId]).toEqual(response);
    state.dispose();
  });

  it("observes server message elements and chooses the newest visible message", async () => {
    vi.useFakeTimers();
    let observerCallback: IntersectionObserverCallback | null = null;
    const observed: Element[] = [];
    const markRead = vi.fn().mockResolvedValue({
      unreadCount: 0,
      lastReadMessageId: newerId,
      notificationMode: "mentions"
    });
    const state = useCommunityTopicState({
      markRead,
      createObserver: (callback) => {
        observerCallback = callback;
        return {
          observe: (element) => observed.push(element),
          disconnect: vi.fn()
        };
      }
    });
    const container = document.createElement("div");
    for (const item of messages) {
      const element = document.createElement("article");
      element.id = `chat-message-${item.id}`;
      const sentinel = document.createElement("span");
      sentinel.dataset.communityReadEnd = item.id;
      element.append(sentinel);
      container.append(element);
    }

    state.selectTopic(topicId, messages);
    state.observeVisibleMessages(container);
    expect(observed).toHaveLength(2);
    const callback = observerCallback as IntersectionObserverCallback | null;
    expect(callback).not.toBeNull();
    callback!(
      observed.map((target) => ({ target, isIntersecting: true, intersectionRatio: 1 })) as IntersectionObserverEntry[],
      {} as IntersectionObserver
    );
    await vi.advanceTimersByTimeAsync(400);

    expect(markRead).toHaveBeenCalledWith(topicId, newerId);
    state.dispose();
  });

  it("marks a message taller than two viewports read when its end sentinel appears", async () => {
    vi.useFakeTimers();
    let observerCallback: IntersectionObserverCallback | null = null;
    const observed: Element[] = [];
    const markRead = vi.fn().mockResolvedValue({
      unreadCount: 0,
      lastReadMessageId: newerId,
      notificationMode: "mentions"
    });
    const state = useCommunityTopicState({
      markRead,
      createObserver: (callback) => {
        observerCallback = callback;
        return { observe: (element) => observed.push(element), disconnect: vi.fn() };
      }
    });
    const container = document.createElement("div");
    const tallMessage = document.createElement("article");
    tallMessage.id = `chat-message-${newerId}`;
    Object.defineProperty(tallMessage, "scrollHeight", { value: 2_400 });
    const sentinel = document.createElement("span");
    sentinel.dataset.communityReadEnd = newerId;
    tallMessage.append(sentinel);
    container.append(tallMessage);

    state.selectTopic(topicId, [messages[0]!]);
    state.observeVisibleMessages(container);
    expect(observed).toEqual([sentinel]);
    observerCallback!([
      { target: sentinel, isIntersecting: true, intersectionRatio: 0.01 } as unknown as IntersectionObserverEntry
    ], {} as IntersectionObserver);
    await vi.advanceTimersByTimeAsync(400);

    expect(markRead).toHaveBeenCalledWith(topicId, newerId);
    state.dispose();
  });

  it("flushes a pending read immediately when the room closes", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn().mockResolvedValue({
      unreadCount: 0,
      lastReadMessageId: olderId,
      notificationMode: "mentions"
    });
    const state = useCommunityTopicState({ markRead });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);

    await state.closeTopic();

    expect(markRead).toHaveBeenCalledWith(topicId, olderId);
    state.dispose();
  });

  it("flushes a pending read when the document becomes hidden", async () => {
    vi.useFakeTimers();
    const documentTarget = new EventTarget() as Document;
    Object.defineProperty(documentTarget, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    const markRead = vi.fn().mockResolvedValue({
      unreadCount: 0,
      lastReadMessageId: olderId,
      notificationMode: "mentions"
    });
    const state = useCommunityTopicState({ markRead, documentTarget });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(markRead).toHaveBeenCalledWith(topicId, olderId);
    state.dispose();
  });

  it("does not carry a failed room-close read into the next topic", async () => {
    vi.useFakeTimers();
    const secondTopicId = "00000000-0000-4000-8000-000000000020";
    const markRead = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        unreadCount: 0,
        lastReadMessageId: newerId,
        notificationMode: "mentions"
      });
    const state = useCommunityTopicState({ markRead });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);
    await state.closeTopic();

    state.selectTopic(secondTopicId, messages.map((item) => ({ ...item, topicId: secondTopicId })));
    await state.flushRead();

    expect(markRead).toHaveBeenCalledTimes(1);
    expect(markRead).toHaveBeenCalledWith(topicId, olderId);
    state.dispose();
  });

  it("does not resend the same read position after older history changes local indexes", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn().mockResolvedValue({
      unreadCount: 0,
      lastReadMessageId: newerId,
      notificationMode: "mentions"
    });
    const state = useCommunityTopicState({ markRead });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(newerId);
    await vi.advanceTimersByTimeAsync(400);

    state.selectTopic(topicId, [
      ...messages,
      message("00000000-0000-4000-8000-000000000100", "2026-07-29T11:59:00.000Z")
    ]);
    state.markVisibleMessageRead(newerId);
    await vi.advanceTimersByTimeAsync(400);

    expect(markRead).toHaveBeenCalledTimes(1);
    state.dispose();
  });

  it("drops the previous account's read position when client state is reset", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn().mockResolvedValue({
      unreadCount: 0,
      lastReadMessageId: olderId,
      notificationMode: "mentions"
    });
    const state = useCommunityTopicState({ markRead });
    state.selectTopic(topicId, messages);
    state.syncAuthoritativeState(topicId, {
      unreadCount: 0,
      lastReadMessageId: newerId,
      notificationMode: "all"
    });

    state.reset();
    state.syncTopics([topic()]);
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);
    await vi.advanceTimersByTimeAsync(400);

    expect(markRead).toHaveBeenCalledWith(topicId, olderId);
    state.dispose();
  });

  it("does not let a delayed room close clear the newly selected room observer state", async () => {
    vi.useFakeTimers();
    const secondTopicId = "00000000-0000-4000-8000-000000000020";
    let resolveFirst!: (state: CommunityTopicState) => void;
    const markRead = vi.fn()
      .mockImplementationOnce(() => new Promise<CommunityTopicState>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({
        unreadCount: 0,
        lastReadMessageId: newerId,
        notificationMode: "mentions"
      });
    const state = useCommunityTopicState({ markRead });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);
    const closing = state.closeTopic();

    state.selectTopic(secondTopicId, messages.map((item) => ({ ...item, topicId: secondTopicId })));
    resolveFirst({ unreadCount: 0, lastReadMessageId: olderId, notificationMode: "mentions" });
    await closing;
    state.markVisibleMessageRead(newerId);
    await vi.advanceTimersByTimeAsync(400);

    expect(markRead).toHaveBeenCalledWith(secondTopicId, newerId);
    state.dispose();
  });

  it("retries a transient read failure after bounded backoff", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        unreadCount: 0,
        lastReadMessageId: olderId,
        notificationMode: "mentions"
      });
    const state = useCommunityTopicState({ markRead, retryBaseMs: 100, retryMaximumMs: 1_000 });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);

    await vi.advanceTimersByTimeAsync(400);
    expect(markRead).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(markRead).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(markRead).toHaveBeenCalledTimes(2);
    expect(state.topicStates.value[topicId]?.lastReadMessageId).toBe(olderId);
    state.dispose();
  });

  it("retries a retained read immediately when connectivity returns", async () => {
    vi.useFakeTimers();
    const windowTarget = new EventTarget() as Window;
    const markRead = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        unreadCount: 0,
        lastReadMessageId: olderId,
        notificationMode: "mentions"
      });
    const state = useCommunityTopicState({ markRead, windowTarget, retryBaseMs: 10_000 });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);
    await vi.advanceTimersByTimeAsync(400);

    windowTarget.dispatchEvent(new Event("online"));
    await Promise.resolve();
    await Promise.resolve();

    expect(markRead).toHaveBeenCalledTimes(2);
    state.dispose();
  });

  it("retains a failed close read and retries it when the same topic is reopened", async () => {
    vi.useFakeTimers();
    const markRead = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        unreadCount: 0,
        lastReadMessageId: olderId,
        notificationMode: "mentions"
      });
    const state = useCommunityTopicState({ markRead, retryBaseMs: 10_000 });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);
    await state.closeTopic();

    state.selectTopic(topicId, messages);
    await Promise.resolve();
    await Promise.resolve();

    expect(markRead).toHaveBeenCalledTimes(2);
    state.dispose();
  });

  it("ignores an authoritative read response from a reset account generation", async () => {
    vi.useFakeTimers();
    let resolveRead!: (state: CommunityTopicState) => void;
    const state = useCommunityTopicState({
      markRead: () => new Promise<CommunityTopicState>((resolve) => {
        resolveRead = resolve;
      })
    });
    state.selectTopic(topicId, messages);
    state.markVisibleMessageRead(olderId);
    await vi.advanceTimersByTimeAsync(400);

    state.reset();
    resolveRead({ unreadCount: 0, lastReadMessageId: olderId, notificationMode: "mentions" });
    await Promise.resolve();
    await Promise.resolve();

    expect(state.topicStates.value).toEqual({});
    state.dispose();
  });
});
