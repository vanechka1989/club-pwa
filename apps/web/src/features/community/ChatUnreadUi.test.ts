import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClubMessage, ClubTopic } from "@club/shared";
import { nextTick } from "vue";
import ChatRoom from "./ChatRoom.vue";
import ChatTopicList from "./ChatTopicList.vue";

const author = {
  id: "author-1",
  telegramId: "author@example.com",
  firstName: "Анна",
  username: "anna",
  displayName: "Анна",
  photoUrl: null,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarScale: 1
};

function topic(overrides: Partial<ClubTopic> = {}): ClubTopic {
  return {
    id: "topic-1",
    chatId: "chat-1",
    title: "Общий чат",
    description: null,
    isPinned: false,
    isLocked: false,
    isPublished: true,
    isAdminOnly: false,
    archivedUntil: null,
    messagesCount: 4,
    latestReplyToMeAt: null,
    unreadCount: 0,
    notificationMode: "mentions",
    createdAt: "2026-07-28T10:00:00.000Z",
    ...overrides
  };
}

function message(index: number, overrides: Partial<ClubMessage> = {}): ClubMessage {
  return {
    id: `message-${index}`,
    topicId: "topic-1",
    body: `Сообщение ${index}`,
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
    createdAt: `2026-07-28T10:0${index}:00.000Z`,
    ...overrides
  };
}

function roomProps(overrides: Record<string, unknown> = {}) {
  return {
    topic: topic({ unreadCount: 3 }),
    messages: [message(4), message(3), message(2), message(1)],
    initialUnreadCount: 3,
    messagesNextCursor: null,
    loadingOlderMessages: false,
    messageSaving: false,
    notificationSaving: false,
    communityError: null,
    isModerator: false,
    viewer: null,
    canWrite: true,
    isMuted: false,
    muteComposerText: "",
    unavailableComposerText: "",
    replyToMessage: null,
    draft: "",
    composerResetVersion: 0,
    reactionCompletedVersion: 0,
    interactionResetVersion: 0,
    activeModerationMessage: null,
    ...overrides
  };
}

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

afterEach(async () => {
  await nextTick();
  cleanup();
  await nextTick();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  }
});

describe("community unread UI", () => {
  it("shows the exact unread count with Russian singular and plural accessible labels", () => {
    render(ChatTopicList, {
      props: {
        activeTopics: [topic({ id: "one", unreadCount: 1 }), topic({ id: "three", title: "Новости", unreadCount: 3 })],
        archivedTopics: [],
        isModerator: false,
        hasNewReplyToMe: () => false
      }
    });

    expect(screen.getByRole("status", { name: "1 непрочитанное сообщение" }).textContent).toBe("1");
    expect(screen.getByRole("status", { name: "3 непрочитанных сообщения" }).textContent).toBe("3");
  });

  it("places the divider before the first eligible unread message and opens at it", async () => {
    const scrollTarget = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollTarget });
    const viewer = { id: "viewer-1" };
    render(ChatRoom, {
      props: roomProps({
        viewer,
        initialUnreadCount: 2,
        messages: [
          message(6, { status: "hidden" }),
          message(5),
          message(4, { isSystem: true }),
          message(3),
          message(2, { author: { ...author, id: viewer.id } }),
          message(1)
        ]
      })
    });

    const divider = screen.getByText("Новые сообщения");
    expect(divider.compareDocumentPosition(document.getElementById("chat-message-message-3")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await vi.waitFor(() => expect(scrollTarget).toHaveBeenCalled());
    expect((scrollTarget.mock.instances.at(-1) as HTMLElement).id).toBe("chat-message-message-3");
  });

  it("shows a down control away from bottom and adds a count for an incoming message", async () => {
    const scrollTarget = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollTarget });
    const view = render(ChatRoom, { props: roomProps({ initialUnreadCount: 0, messages: [message(1)] }) });
    const container = document.querySelector<HTMLElement>(".chat-messages")!;
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 300 }
    });
    await fireEvent.scroll(container);
    expect(screen.getByRole("button", { name: "Перейти к новым сообщениям" }).textContent).toBe("");

    await view.rerender({ ...roomProps({ initialUnreadCount: 0, messages: [message(2), message(1)] }) });

    const jumpButton = screen.getByRole("button", { name: "Перейти к новым сообщениям" });
    expect(jumpButton.textContent).toContain("1");
    await fireEvent.click(jumpButton);
    expect(screen.queryByRole("button", { name: "Перейти к новым сообщениям" })).toBeNull();
    expect((scrollTarget.mock.instances.at(-1) as HTMLElement).id).toBe("chat-message-message-2");
  });

  it("uses radio semantics for the default per-topic mentions notification mode", async () => {
    const view = render(ChatRoom, { props: roomProps() });
    await fireEvent.click(screen.getByRole("button", { name: "Меню чата" }));

    expect((screen.getByRole("radio", { name: "Только упоминания" }) as HTMLInputElement).checked).toBe(true);
    await fireEvent.click(screen.getByRole("radio", { name: "Все сообщения" }));
    expect(view.emitted()["update-notification-mode"]).toEqual([["all"]]);
  });
});
