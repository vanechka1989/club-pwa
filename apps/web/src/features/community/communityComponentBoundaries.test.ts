import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubMessage, ClubTopic, ClubUser } from "@club/shared";
import { useSessionStore } from "@/stores/session";
import ChatComposer from "./ChatComposer.vue";
import ChatMessage from "./ChatMessage.vue";
import ChatRoom from "./ChatRoom.vue";
import CommunitySection from "./CommunitySection.vue";
import { resetCommunityDrafts } from "./communityDrafts";
import { resetCommunityOutbox } from "./communityOutbox";

const apiMocks = vi.hoisted(() => ({
  createClubMessage: vi.fn(),
  createTopicUserMute: vi.fn(),
  deleteTopicMessages: vi.fn(),
  getClubMessages: vi.fn(),
  getCommunityTopics: vi.fn(),
  markCommunityTopicRead: vi.fn()
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    createClubMessage: apiMocks.createClubMessage,
    createTopicUserMute: apiMocks.createTopicUserMute,
    deleteTopicMessages: apiMocks.deleteTopicMessages,
    getClubMessages: apiMocks.getClubMessages,
    getCommunityTopics: apiMocks.getCommunityTopics,
    markCommunityTopicRead: apiMocks.markCommunityTopicRead
  };
});

function read(name: string) {
  const path = resolve(__dirname, name);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

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

function message(overrides: Partial<ClubMessage> = {}): ClubMessage {
  return {
    id: "message-1",
    topicId: "topic-1",
    body: "Сообщение для модерации",
    kind: "text",
    voice: null,
    images: [],
    video: null,
    document: null,
    poll: null,
    isSystem: false,
    status: "visible",
    author,
    replyTo: {
      id: "reply-1",
      body: "Исходное сообщение",
      author: { ...author, id: "reply-author", displayName: "Мария" }
    },
    likesCount: 0,
    dislikesCount: 0,
    reactionCounts: [{ reaction: "heart", count: 1 }],
    myReaction: null,
    authorMute: null,
    pinnedAt: null,
    editedAt: null,
    deletedByUserAt: null,
    clientOperationId: null,
    mentions: [],
    createdAt: "2026-07-28T12:00:00.000Z",
    ...overrides
  };
}

const topic: ClubTopic = {
  id: "topic-1",
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
  createdAt: "2026-07-28T10:00:00.000Z"
};

function adminUser(): ClubUser {
  return {
    id: "admin-1",
    telegramId: "admin@example.com",
    email: "admin@example.com",
    firstName: "Админ",
    username: "admin@example.com",
    photoUrl: null,
    role: "owner",
    realRole: "owner",
    adminRoleLabel: null,
    adminPermissions: ["community"],
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "manual",
    recurrentPaymentStatus: null,
    nextPaymentAt: null,
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 1,
    avatarRefreshedAt: null
  };
}

function roomProps(overrides: Record<string, unknown> = {}) {
  return {
    topic,
    messages: [message()],
    messagesNextCursor: null,
    loadingOlderMessages: false,
    messageSaving: false,
    communityError: null,
    isModerator: true,
    viewer: null,
    canWrite: true,
    isMuted: false,
    muteComposerText: "",
    unavailableComposerText: "",
    replyToMessage: null,
    draft: "Ответ",
    composerResetVersion: 0,
    reactionCompletedVersion: 0,
    interactionResetVersion: 0,
    activeModerationMessage: null,
    ...overrides
  };
}

async function renderCommunity(expectedMessage = "Сообщение для модерации") {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore(pinia).user = adminUser();
  const view = render(CommunitySection, { global: { plugins: [pinia] } });
  await fireEvent.click(await screen.findByRole("button", { name: /Общий чат/ }));
  await screen.findByText(expectedMessage);
  return view;
}

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

beforeEach(() => {
  localStorage.clear();
  resetCommunityDrafts();
  resetCommunityOutbox();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  apiMocks.createTopicUserMute.mockReset().mockResolvedValue({ message: message({ id: "mute-system", isSystem: true }) });
  apiMocks.createClubMessage.mockReset().mockResolvedValue({
    message: message({ id: "sent-message", body: "Отправлено" })
  });
  apiMocks.deleteTopicMessages.mockReset().mockResolvedValue({ ok: true });
  apiMocks.getClubMessages.mockReset().mockResolvedValue({
    messages: [message()],
    nextCursor: null,
    mutedUntil: null,
    mutedPermanently: false
  });
  apiMocks.getCommunityTopics.mockReset().mockResolvedValue({ topics: [topic] });
  apiMocks.markCommunityTopicRead.mockReset().mockResolvedValue({
    unreadCount: 0,
    lastReadMessageId: "00000000-0000-4000-8000-000000000100",
    notificationMode: "mentions"
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView
    });
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  }
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
  } else {
    delete (URL as Partial<typeof URL>).createObjectURL;
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
  } else {
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  }
});

describe("community component boundaries", () => {
  it("keeps API orchestration in the compact section", () => {
    const sectionSource = read("CommunitySection.vue");
    const messageSource = read("ChatMessage.vue");
    const topicListSource = read("ChatTopicList.vue");

    expect(sectionSource.length).toBeLessThan(45_000);
    expect(messageSource).not.toContain("@/api/client");
    expect(topicListSource).not.toContain("@/api/client");
    expect(sectionSource).toContain("<ChatTopicList");
    expect(sectionSource).toContain("<ChatRoom");
  });

  it("makes reply navigation keyboard-focusable and emits the referenced message id", async () => {
    const view = render(ChatMessage, {
      props: {
        message: message(),
        viewer: null,
        isModerator: true,
        messageSaving: false,
        highlighted: false
      }
    });

    const preview = screen.getByRole("button", { name: "Перейти к сообщению Мария" });
    preview.focus();
    expect(document.activeElement).toBe(preview);

    await fireEvent.keyDown(preview, { key: "Enter" });

    expect(view.emitted()["jump-reply"]).toEqual([["reply-1"]]);
  });

  it("emits typed message payloads and forwards them through the room", async () => {
    const direct = render(ChatMessage, {
      props: {
        message: message(),
        viewer: null,
        isModerator: true,
        messageSaving: false,
        highlighted: false
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением пользователя Анна" }));
    await fireEvent.click(document.querySelector(".message-reaction-button")!);

    expect(direct.emitted()["open-actions"]).toEqual([[message()]]);
    expect(direct.emitted().react).toEqual([[message(), "heart"]]);

    cleanup();
    const room = render(ChatRoom, { props: roomProps() });
    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением пользователя Анна" }));
    await fireEvent.click(document.querySelector(".message-reaction-button")!);
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(room.emitted()["open-actions"]).toEqual([[message()]]);
    expect(room.emitted().react).toEqual([[message(), "heart"]]);
    expect(room.emitted()["send-text"]).toEqual([["Ответ"]]);
  });

  it("preserves a failed image draft and clears it only after an explicit success reset", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const props = {
      canWrite: true,
      isMuted: false,
      muteComposerText: "",
      unavailableComposerText: "",
      messageSaving: false,
      replyToMessage: null,
      draft: "",
      resetVersion: 0
    };
    const view = render(ChatComposer, { props });
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    await fireEvent.click(screen.getByRole("button", { name: "Отправить 1" }));
    expect(view.emitted()["send-files"]).toEqual([[[file]]]);

    await view.rerender({ ...props, messageSaving: true });
    await view.rerender({ ...props, messageSaving: false });
    expect(screen.getByRole("button", { name: "Отправить 1" })).toBeTruthy();

    await view.rerender({ ...props, resetVersion: 1 });
    expect(screen.queryByRole("button", { name: "Отправить 1" })).toBeNull();
  });

  it("closes a reaction picker when the parent resets interactions for the same topic", async () => {
    const view = render(ChatRoom, { props: roomProps() });
    await fireEvent.click(document.getElementById("chat-message-message-1")!);
    expect(screen.getByRole("dialog", { name: "Выберите реакцию" })).toBeTruthy();

    await view.rerender(roomProps({ interactionResetVersion: 1 }));

    expect(screen.queryByRole("dialog", { name: "Выберите реакцию" })).toBeNull();
  });

  it("resets the reaction picker after bulk moderation", async () => {
    await renderCommunity();
    await fireEvent.click(document.getElementById("chat-message-message-1")!);
    expect(screen.getByRole("dialog", { name: "Выберите реакцию" })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Меню чата" }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить все сообщения" }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить всё" }));

    await waitFor(() => expect(apiMocks.deleteTopicMessages).toHaveBeenCalledWith("topic-1"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Выберите реакцию" })).toBeNull());
  });

  it("resets the reaction picker after reloading the same topic", async () => {
    await renderCommunity();
    await fireEvent.click(document.getElementById("chat-message-message-1")!);
    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением пользователя Анна" }));
    await fireEvent.click(screen.getByRole("button", { name: "Ограничить до ручного снятия" }));

    await waitFor(() => expect(apiMocks.createTopicUserMute).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledTimes(2));
    await screen.findByText("Сообщение для модерации");

    expect(screen.queryByRole("dialog", { name: "Выберите реакцию" })).toBeNull();
  });

  it("restores the authenticated user's topic draft after the community view reloads", async () => {
    const first = await renderCommunity();
    const composer = screen.getByPlaceholderText("Сообщение") as HTMLInputElement;
    await fireEvent.update(composer, "Сохранённый черновик");
    first.unmount();
    cleanup();

    await renderCommunity();

    expect((screen.getByPlaceholderText("Сообщение") as HTMLInputElement).value).toBe("Сохранённый черновик");
  });

  it("keeps a failed text send optimistic and reconciles it with a realtime confirmation after reload", async () => {
    apiMocks.createClubMessage.mockRejectedValue(new Error("offline"));
    const first = await renderCommunity();
    await fireEvent.update(screen.getByPlaceholderText("Сообщение"), "Офлайн-сообщение");
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(localStorage.getItem("club-community-text-outbox-v1")).not.toBeNull());
    await screen.findByText("Офлайн-сообщение");
    const [queued] = JSON.parse(localStorage.getItem("club-community-text-outbox-v1") ?? "[]") as Array<{
      deliveryKey: string;
    }>;
    first.unmount();
    cleanup();
    resetCommunityDrafts();
    resetCommunityOutbox();
    apiMocks.getClubMessages.mockResolvedValue({
      messages: [message({
        id: "confirmed-message",
        body: "Офлайн-сообщение",
        clientOperationId: queued!.deliveryKey
      })],
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: false
    });

    await renderCommunity("Офлайн-сообщение");

    expect(await screen.findAllByText("Офлайн-сообщение")).toHaveLength(1);
    expect(localStorage.getItem("club-community-text-outbox-v1")).toBeNull();
  });

  it("restores the draft instead of retrying a terminal muted-account rejection", async () => {
    apiMocks.createClubMessage.mockRejectedValue({
      status: 403,
      data: { mutedPermanently: true }
    });
    await renderCommunity();
    const composer = screen.getByPlaceholderText("Сообщение") as HTMLInputElement;
    await fireEvent.update(composer, "Сообщение во время мута");
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => expect(localStorage.getItem("club-community-text-outbox-v1")).toBeNull());
    expect(composer.value).toBe("Сообщение во время мута");
  });
});
