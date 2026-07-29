import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClubMessage, ClubTopic } from "@club/shared";
import ChatMessage from "./ChatMessage.vue";
import ChatRoom from "./ChatRoom.vue";

const author = {
  id: "00000000-0000-4000-8000-000000000001",
  telegramId: "anna@example.com",
  firstName: "Анна",
  username: "anna",
  displayName: "Анна",
  photoUrl: null,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarScale: 1
};

function message(overrides: Partial<ClubMessage> = {}): ClubMessage {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    topicId: "00000000-0000-4000-8000-000000000010",
    body: "Привет @Мария",
    kind: "text",
    voice: null,
    images: [],
    video: null,
    document: null,
    poll: null,
    isSystem: false,
    status: "visible",
    author,
    replyTo: null,
    likesCount: 0,
    dislikesCount: 0,
    reactionCounts: [{ reaction: "heart", count: 1 }],
    myReaction: null,
    authorMute: null,
    pinnedAt: null,
    editedAt: null,
    deletedByUserAt: null,
    clientOperationId: null,
    mentions: [{
      userId: "00000000-0000-4000-8000-000000000002",
      displayName: "Мария",
      start: 7,
      end: 13
    }],
    createdAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}

const topic: ClubTopic = {
  id: "00000000-0000-4000-8000-000000000010",
  chatId: "chat-1",
  title: "Общий чат",
  description: null,
  isPinned: false,
  isLocked: false,
  isPublished: true,
  isAdminOnly: false,
  archivedUntil: null,
  messagesCount: 1,
  latestReplyToMeAt: null,
  unreadCount: 0,
  notificationMode: "mentions",
  createdAt: "2026-07-29T09:00:00.000Z"
};

function roomProps(messages: ClubMessage[], overrides: Record<string, unknown> = {}) {
  return {
    topic,
    messages: [...messages].reverse(),
    queuedMessages: [],
    messagesNextCursor: null,
    loadingOlderMessages: false,
    messageSaving: false,
    communityError: null,
    isModerator: false,
    viewer: author,
    canWrite: true,
    isMuted: false,
    muteComposerText: "",
    unavailableComposerText: "",
    replyToMessage: null,
    editMessage: null,
    draft: "",
    composerResetVersion: 0,
    reactionCompletedVersion: 0,
    interactionResetVersion: 0,
    activeActionMessage: null,
    ...overrides
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("community message interactions", () => {
  it("keeps a short bubble click inert while long press and the visible keyboard menu open actions", async () => {
    vi.useFakeTimers();
    const view = render(ChatMessage, {
      props: {
        message: message(),
        viewer: author,
        isModerator: false,
        messageSaving: false,
        highlighted: false,
        groupedWithPrevious: false,
        groupedWithNext: false,
        deliveryState: "sent"
      }
    });
    const article = document.querySelector("article")!;

    await fireEvent.click(article);
    expect(view.emitted()["open-actions"]).toBeUndefined();
    expect(view.emitted()["toggle-reactions"]).toBeUndefined();

    await fireEvent.pointerDown(article, { clientX: 10, clientY: 10, pointerId: 1 });
    await vi.advanceTimersByTimeAsync(550);
    expect(view.emitted()["open-actions"]).toEqual([[expect.objectContaining({ id: message().id })]]);

    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением Анна" }));
    expect(view.emitted()["open-actions"]).toHaveLength(2);
  });

  it("offers failed retry without changing the optimistic delivery identity", async () => {
    const failed = message({
      id: "local:device:operation-1",
      clientOperationId: "device:operation-1"
    });
    const view = render(ChatMessage, {
      props: {
        message: failed,
        viewer: author,
        isModerator: false,
        messageSaving: false,
        highlighted: false,
        groupedWithPrevious: false,
        groupedWithNext: false,
        deliveryState: "failed"
      }
    });

    expect(screen.getByText("Не отправлено")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Повторить отправку" }));
    expect(view.emitted().retry).toEqual([[failed]]);
  });

  it("marks edited content and never leaks a deleted member message through rich content", () => {
    const deletedMember = message({
      body: "Сообщение удалено",
      mentions: [],
      reactionCounts: [],
      deletedByUserAt: null,
      editedAt: null
    });
    const member = render(ChatMessage, {
      props: {
        message: deletedMember,
        viewer: { ...author, id: "viewer-2" },
        isModerator: false,
        messageSaving: false,
        highlighted: false,
        groupedWithPrevious: false,
        groupedWithNext: false,
        deliveryState: "sent"
      }
    });
    expect(screen.getByText("Сообщение удалено").classList.contains("chat-message-tombstone")).toBe(true);
    expect(document.querySelector(".message-reactions")).toBeNull();
    member.unmount();
    cleanup();

    render(ChatMessage, {
      props: {
        message: message({
          body: "Исходный секрет",
          mentions: [],
          deletedByUserAt: "2026-07-29T10:05:00.000Z",
          editedAt: "2026-07-29T10:03:00.000Z"
        }),
        viewer: { ...author, id: "moderator-1" },
        isModerator: true,
        messageSaving: false,
        highlighted: false,
        groupedWithPrevious: false,
        groupedWithNext: false,
        deliveryState: "sent"
      }
    });
    expect(screen.getByText("Исходный секрет")).toBeTruthy();
    expect(screen.getByText("Удалено пользователем · оригинал виден модератору")).toBeTruthy();
    expect(screen.getByText("изменено")).toBeTruthy();
  });

  it("groups only adjacent same-author messages within five minutes and adds day separators", () => {
    const messages = [
      message({ id: "one", body: "Один", createdAt: "2026-07-28T10:00:00.000Z" }),
      message({ id: "two", body: "Два", createdAt: "2026-07-28T10:05:00.000Z" }),
      message({ id: "three", body: "Три", createdAt: "2026-07-28T10:10:00.001Z" }),
      message({ id: "system", body: "Система", isSystem: true, createdAt: "2026-07-28T10:11:00.000Z" }),
      message({ id: "next-day", body: "Новый день", createdAt: "2026-07-29T10:00:00.000Z" })
    ];
    render(ChatRoom, { props: roomProps(messages) });

    expect(document.getElementById("chat-message-one")?.classList.contains("chat-message-grouped-next")).toBe(true);
    expect(document.getElementById("chat-message-two")?.classList.contains("chat-message-grouped-previous")).toBe(true);
    expect(document.getElementById("chat-message-three")?.classList.contains("chat-message-grouped-previous")).toBe(false);
    expect(document.getElementById("chat-message-system")?.classList.contains("chat-message-grouped-previous")).toBe(false);
    expect(document.querySelectorAll(".chat-date-divider")).toHaveLength(2);
  });

  it("shows own edit/delete only through the exact client-side fifteen-minute boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T10:15:00.000Z"));
    const own = message();
    const view = render(ChatRoom, {
      props: roomProps([own], { activeActionMessage: own })
    });

    expect(screen.getByRole("button", { name: "Редактировать сообщение" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Удалить своё сообщение" })).toBeTruthy();

    vi.setSystemTime(new Date("2026-07-29T10:15:00.001Z"));
    await view.rerender(roomProps([own], { activeActionMessage: own, interactionResetVersion: 1 }));
    expect(screen.queryByRole("button", { name: "Редактировать сообщение" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить своё сообщение" })).toBeNull();
  });

  it("restores focus to the explicit message menu after the action sheet closes", async () => {
    const own = message();
    const view = render(ChatRoom, { props: roomProps([own]) });
    const trigger = screen.getByRole("button", { name: "Действия с сообщением Анна" });
    trigger.focus();
    await fireEvent.click(trigger);
    await view.rerender(roomProps([own], { activeActionMessage: own }));
    expect(screen.getByRole("dialog", { name: "Анна" })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await view.rerender(roomProps([own], { activeActionMessage: null }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
