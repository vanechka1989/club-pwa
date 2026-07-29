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
  getCommunityMessageContext: vi.fn(),
  getCommunityTopics: vi.fn(),
  markCommunityTopicRead: vi.fn(),
  searchCommunityMessages: vi.fn()
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    createClubMessage: apiMocks.createClubMessage,
    createTopicUserMute: apiMocks.createTopicUserMute,
    deleteTopicMessages: apiMocks.deleteTopicMessages,
    getClubMessages: apiMocks.getClubMessages,
    getCommunityMessageContext: apiMocks.getCommunityMessageContext,
    getCommunityTopics: apiMocks.getCommunityTopics,
    markCommunityTopicRead: apiMocks.markCommunityTopicRead,
    searchCommunityMessages: apiMocks.searchCommunityMessages
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

function sequenceMessage(index: number): ClubMessage {
  return message({
    id: `sequence-${index}`,
    body: `Последовательность ${index}`,
    createdAt: new Date(Date.UTC(2026, 6, 28, 10, index)).toISOString()
  });
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

const secondTopic: ClubTopic = {
  ...topic,
  id: "topic-2",
  title: "Вторая тема",
  messagesCount: 1
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

function secondAdminUser(): ClubUser {
  return { ...adminUser(), id: "admin-2", telegramId: "admin-2@example.com", email: "admin-2@example.com" };
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
const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalGetClientRects = HTMLElement.prototype.getClientRects;

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
  apiMocks.getCommunityMessageContext.mockReset().mockResolvedValue({
    targetMessageId: "message-1",
    messages: [message()]
  });
  apiMocks.searchCommunityMessages.mockReset().mockResolvedValue({
    results: [{
      messageId: "message-1",
      topicId: topic.id,
      topicTitle: topic.title,
      author,
      excerpt: "Сообщение для модерации",
      createdAt: "2026-07-28T12:00:00.000Z"
    }],
    nextCursor: null
  });
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
  if (originalIntersectionObserver) {
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: originalIntersectionObserver });
  } else {
    delete (globalThis as Partial<typeof globalThis>).IntersectionObserver;
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
  Object.defineProperty(HTMLElement.prototype, "getClientRects", {
    configurable: true,
    value: originalGetClientRects
  });
});

describe("community component boundaries", () => {
  it("keeps API orchestration in the compact section", () => {
    const sectionSource = read("CommunitySection.vue");
    const messageSource = read("ChatMessage.vue");
    const topicListSource = read("ChatTopicList.vue");

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

    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением Анна" }));
    await fireEvent.click(document.querySelector(".message-reaction-button")!);

    expect(direct.emitted()["open-actions"]).toEqual([[message()]]);
    expect(direct.emitted().react).toEqual([[message(), "heart"]]);

    cleanup();
    const room = render(ChatRoom, { props: roomProps() });
    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением Анна" }));
    await fireEvent.click(document.querySelector(".message-reaction-button")!);
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(room.emitted()["open-actions"]).toEqual([[message()]]);
    expect(room.emitted().react).toEqual([[message(), "heart"]]);
    expect(room.emitted()["send-text"]).toEqual([["Ответ", []]]);
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

  it("closes the explicit action sheet when the parent resets interactions for the same topic", async () => {
    const view = render(ChatRoom, { props: roomProps({ activeModerationMessage: message() }) });
    expect(screen.getByRole("dialog", { name: "Анна" })).toBeTruthy();

    await view.rerender(roomProps({ activeModerationMessage: null, interactionResetVersion: 1 }));

    expect(screen.queryByRole("dialog", { name: "Анна" })).toBeNull();
  });

  it("resets the action sheet after bulk moderation", async () => {
    await renderCommunity();
    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением Анна" }));
    expect(screen.getByRole("dialog", { name: "Анна" })).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Меню чата" }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить все сообщения" }));
    await fireEvent.click(screen.getByRole("button", { name: "Удалить всё" }));

    await waitFor(() => expect(apiMocks.deleteTopicMessages).toHaveBeenCalledWith("topic-1"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Анна" })).toBeNull());
  });

  it("resets the action sheet after reloading the same topic", async () => {
    await renderCommunity();
    await fireEvent.click(screen.getByRole("button", { name: "Действия с сообщением Анна" }));
    await fireEvent.click(screen.getByRole("button", { name: "Ограничить до ручного снятия" }));

    await waitFor(() => expect(apiMocks.createTopicUserMute).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledTimes(2));
    await screen.findByText("Сообщение для модерации");

    expect(screen.queryByRole("dialog", { name: "Анна" })).toBeNull();
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

  it("does not render delayed out-of-order confirmations from another topic in the open room", async () => {
    const deviceId = "00000000-0000-4000-8000-000000000001";
    localStorage.setItem("club-community-device-id-v1", deviceId);
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify([
      {
        userId: "admin-1",
        deviceId,
        topicId: "topic-1",
        localId: "local-a",
        deliveryKey: `${deviceId}:local-a`,
        body: "Очередь первой темы",
        replyToMessageId: null,
        createdAt: 1,
        status: "queued",
        attempts: 0
      },
      {
        userId: "admin-1",
        deviceId,
        topicId: "topic-2",
        localId: "local-b",
        deliveryKey: `${deviceId}:local-b`,
        body: "Очередь второй темы",
        replyToMessageId: null,
        createdAt: 2,
        status: "queued",
        attempts: 0
      }
    ]));
    const deliveries = new Map<string, (value: { message: ClubMessage }) => void>();
    apiMocks.createClubMessage.mockImplementation((topicId: string) => new Promise((resolve) => {
      deliveries.set(topicId, resolve);
    }));
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [topic, secondTopic] });

    await renderCommunity();
    await waitFor(() => expect(deliveries.size).toBe(2));
    deliveries.get("topic-2")!({
      message: message({ id: "confirmed-b", topicId: "topic-2", body: "Очередь второй темы", clientOperationId: `${deviceId}:local-b` })
    });
    await waitFor(() => expect(localStorage.getItem("club-community-text-outbox-v1") ?? "").not.toContain("local-b"));

    expect(screen.queryByText("Очередь второй темы")).toBeNull();
    deliveries.get("topic-1")!({
      message: message({ id: "confirmed-a", topicId: "topic-1", body: "Очередь первой темы", clientOperationId: `${deviceId}:local-a` })
    });
    expect(await screen.findAllByText("Очередь первой темы")).toHaveLength(1);
  });

  it("keeps a background topic snapshot authoritative when it resolves before send confirmation", async () => {
    const deviceId = "00000000-0000-4000-8000-000000000001";
    localStorage.setItem("club-community-device-id-v1", deviceId);
    localStorage.setItem("club-community-text-outbox-v1", JSON.stringify([
      {
        userId: "admin-1",
        deviceId,
        topicId: "topic-2",
        localId: "local-b",
        deliveryKey: `${deviceId}:local-b`,
        body: "Фоновое сообщение",
        replyToMessageId: null,
        createdAt: 1,
        sequence: 1,
        status: "queued",
        attempts: 0,
        nextAttemptAt: 0
      }
    ]));
    let resolveSend!: (value: { message: ClubMessage }) => void;
    apiMocks.createClubMessage.mockImplementation(() => new Promise((resolve) => {
      resolveSend = resolve;
    }));
    apiMocks.getCommunityTopics.mockResolvedValue({
      topics: [topic, { ...secondTopic, messagesCount: 2 }]
    });

    await renderCommunity();
    await waitFor(() => expect(apiMocks.createClubMessage).toHaveBeenCalledTimes(1));
    resolveSend({
      message: message({
        id: "confirmed-b",
        topicId: "topic-2",
        body: "Фоновое сообщение",
        clientOperationId: `${deviceId}:local-b`
      })
    });
    await waitFor(() => expect(localStorage.getItem("club-community-text-outbox-v1")).toBeNull());
    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect((await screen.findByRole("button", { name: /Вторая тема/ })).textContent).toContain("2 сообщений");
  });

  it("does not insert a send confirmation into a different room opened before the request resolves", async () => {
    let resolveSend!: (value: { message: ClubMessage }) => void;
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [topic, secondTopic] });
    apiMocks.createClubMessage.mockImplementation(() => new Promise((resolve) => {
      resolveSend = resolve;
    }));
    await renderCommunity();
    await fireEvent.update(screen.getByPlaceholderText("Сообщение"), "Отправка из первой темы");
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await fireEvent.click(await screen.findByRole("button", { name: /Вторая тема/ }));

    resolveSend({ message: message({ id: "late-send-a", body: "Отправка из первой темы" }) });
    await waitFor(() => expect(localStorage.getItem("club-community-text-outbox-v1")).toBeNull());

    expect(screen.queryByText("Отправка из первой темы")).toBeNull();
  });

  it("discards a room refresh that resolves after the user opens another topic", async () => {
    let resolveFirst!: (value: ReturnType<typeof roomResponse>) => void;
    let resolveSecond!: (value: ReturnType<typeof roomResponse>) => void;
    const roomResponse = (item: ClubMessage) => ({
      messages: [item],
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: false
    });
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [topic, secondTopic] });
    apiMocks.getClubMessages.mockImplementation((topicId: string) => new Promise((resolve) => {
      if (topicId === "topic-1") resolveFirst = resolve;
      else resolveSecond = resolve;
    }));
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).user = adminUser();
    render(CommunitySection, { global: { plugins: [pinia] } });

    await fireEvent.click(await screen.findByRole("button", { name: /Общий чат/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await fireEvent.click(await screen.findByRole("button", { name: /Вторая тема/ }));
    resolveFirst(roomResponse(message({ id: "late-a", body: "Поздний ответ первой темы" })));
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledWith("topic-2"));

    expect(screen.queryByText("Поздний ответ первой темы")).toBeNull();
    resolveSecond(roomResponse(message({ id: "current-b", topicId: "topic-2", body: "Ответ второй темы" })));
    await screen.findByText("Ответ второй темы");
  });

  it("discards an older-history page that resolves after a topic switch", async () => {
    let resolveOlder!: (value: ReturnType<typeof roomResponse>) => void;
    const roomResponse = (item: ClubMessage, nextCursor: string | null = null) => ({
      messages: [item],
      nextCursor,
      mutedUntil: null,
      mutedPermanently: false
    });
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [topic, secondTopic] });
    apiMocks.getClubMessages.mockImplementation((topicId: string, cursor?: string) => {
      if (topicId === "topic-1" && cursor === "older-a") {
        return new Promise((resolve) => {
          resolveOlder = resolve;
        });
      }
      if (topicId === "topic-1") return Promise.resolve(roomResponse(message(), "older-a"));
      return Promise.resolve(roomResponse(message({ id: "current-b", topicId: "topic-2", body: "Ответ второй темы" })));
    });

    await renderCommunity();
    await fireEvent.click(screen.getByRole("button", { name: "Показать предыдущие сообщения" }));
    await fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await fireEvent.click(await screen.findByRole("button", { name: /Вторая тема/ }));
    await screen.findByText("Ответ второй темы");
    resolveOlder(roomResponse(message({ id: "older-a", body: "Старая страница первой темы" })));
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));

    expect(screen.queryByText("Старая страница первой темы")).toBeNull();
  });

  it("reloads account-owned topics on a direct authenticated account switch and ignores the old response", async () => {
    let resolveFirst!: (value: { topics: ClubTopic[] }) => void;
    let resolveSecond!: (value: { topics: ClubTopic[] }) => void;
    apiMocks.getCommunityTopics
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore(pinia);
    session.user = adminUser();
    render(CommunitySection, { global: { plugins: [pinia] } });
    await waitFor(() => expect(apiMocks.getCommunityTopics).toHaveBeenCalledTimes(1));

    session.user = secondAdminUser();
    await nextTick();

    expect(apiMocks.getCommunityTopics).toHaveBeenCalledTimes(2);
    resolveSecond({ topics: [secondTopic] });
    expect(await screen.findByRole("button", { name: /Вторая тема/ })).toBeTruthy();
    resolveFirst({ topics: [topic] });
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: /Общий чат/ })).toBeNull();
  });

  it("replays a same-room invalidation received while its refresh is still in flight", async () => {
    await renderCommunity();
    let resolveRefresh!: (value: {
      messages: ClubMessage[];
      nextCursor: null;
      mutedUntil: null;
      mutedPermanently: false;
    }) => void;
    apiMocks.getClubMessages
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }))
      .mockResolvedValueOnce({
        messages: [message({ id: "latest", body: "Последнее обновление" })],
        nextCursor: null,
        mutedUntil: null,
        mutedPermanently: false
      });

    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledTimes(2));
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 100));
    expect(apiMocks.getClubMessages).toHaveBeenCalledTimes(2);

    resolveRefresh({
      messages: [message({ id: "intermediate", body: "Промежуточное обновление" })],
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: false
    });
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledTimes(3));
    await screen.findByText("Последнее обновление");
  });

  it("fences stale history when a realtime head snapshot shifts the continuation cursor", async () => {
    const initialHead = Array.from({ length: 50 }, (_, index) => sequenceMessage(100 - index));
    const shiftedHead = [sequenceMessage(102), sequenceMessage(101), ...initialHead.slice(0, 48)];
    const restartedHistory = Array.from({ length: 52 }, (_, index) => sequenceMessage(52 - index));
    let resolveStaleHistory!: (value: {
      messages: ClubMessage[];
      nextCursor: null;
      mutedUntil: null;
      mutedPermanently: false;
    }) => void;
    let resolveShiftedHead!: (value: {
      messages: ClubMessage[];
      nextCursor: string;
      mutedUntil: null;
      mutedPermanently: false;
    }) => void;
    let headRequests = 0;
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [{ ...topic, messagesCount: 102 }] });
    apiMocks.getClubMessages.mockImplementation((_topicId: string, cursor?: string) => {
      if (cursor === "cursor-51") return new Promise((resolve) => { resolveStaleHistory = resolve; });
      if (cursor === "cursor-53") return Promise.resolve({
        messages: restartedHistory,
        nextCursor: null,
        mutedUntil: null,
        mutedPermanently: false
      });
      headRequests += 1;
      if (headRequests === 1) return Promise.resolve({
        messages: initialHead,
        nextCursor: "cursor-51",
        mutedUntil: null,
        mutedPermanently: false
      });
      return new Promise((resolve) => { resolveShiftedHead = resolve; });
    });

    await renderCommunity("Последовательность 100");
    await fireEvent.click(screen.getByRole("button", { name: "Показать предыдущие сообщения" }));
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledWith("topic-1", "cursor-51"));
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(headRequests).toBe(2));
    resolveShiftedHead({
      messages: shiftedHead,
      nextCursor: "cursor-53",
      mutedUntil: null,
      mutedPermanently: false
    });
    await screen.findByText("Последовательность 102");
    resolveStaleHistory({
      messages: Array.from({ length: 50 }, (_, index) => sequenceMessage(50 - index)),
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: false
    });

    const loadOlder = await screen.findByRole("button", { name: "Показать предыдущие сообщения" });
    await waitFor(() => expect((loadOlder as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(loadOlder);
    await screen.findByText("Последовательность 1");

    const ids = [...document.querySelectorAll<HTMLElement>(".chat-message")].map((element) => element.id.replace("chat-message-sequence-", ""));
    expect(ids).toHaveLength(102);
    expect(new Set(ids).size).toBe(102);
    expect(ids).toEqual(Array.from({ length: 102 }, (_, index) => String(index + 1)));
  });

  it("keeps automatic unread history paging alive across a same-cursor metadata refresh", async () => {
    const recentHead = Array.from({ length: 50 }, (_, index) => ({
      ...sequenceMessage(51 - index),
      reactionCounts: []
    }));
    const refreshedHead = recentHead.map((item, index) => index === 0
      ? { ...item, reactionCounts: [{ reaction: "heart" as const, count: 1 }] }
      : item);
    const firstUnread = sequenceMessage(1);
    let resolveHistory!: (value: {
      messages: ClubMessage[];
      nextCursor: null;
      mutedUntil: null;
      mutedPermanently: false;
    }) => void;
    let headRequests = 0;
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [{ ...topic, unreadCount: 51, messagesCount: 51 }] });
    apiMocks.getClubMessages.mockImplementation((_topicId: string, cursor?: string) => {
      if (cursor === "cursor-older") {
        return new Promise((resolve) => { resolveHistory = resolve; });
      }
      headRequests += 1;
      return Promise.resolve({
        messages: headRequests === 1 ? recentHead : refreshedHead,
        nextCursor: "cursor-older",
        mutedUntil: null,
        mutedPermanently: false
      });
    });

    await renderCommunity("Последовательность 51");
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledWith("topic-1", "cursor-older"));
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(document.querySelector(".message-reaction-button small")?.textContent).toBe("1"));
    resolveHistory({ messages: [firstUnread], nextCursor: null, mutedUntil: null, mutedPermanently: false });

    await screen.findByText("Последовательность 1");
    const historyCalls = apiMocks.getClubMessages.mock.calls.filter(([, cursor]) => cursor === "cursor-older");
    expect(historyCalls).toHaveLength(1);
    const divider = screen.getByText("Новые сообщения");
    expect(divider.compareDocumentPosition(document.getElementById("chat-message-sequence-1")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps the visible message anchored when realtime appends below a reader who is scrolled up", async () => {
    await renderCommunity();
    const container = document.querySelector<HTMLElement>(".chat-messages")!;
    let scrollTop = 100;
    Object.defineProperties(container, {
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } },
      scrollHeight: { configurable: true, get: () => document.getElementById("chat-message-incoming") ? 1060 : 1000 },
      clientHeight: { configurable: true, value: 300 }
    });
    container.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} });
    document.getElementById("chat-message-message-1")!.getBoundingClientRect = () => ({
      top: 40, bottom: 100, left: 0, right: 300, width: 300, height: 60, x: 0, y: 40, toJSON() {}
    });
    await fireEvent.scroll(container);
    apiMocks.getClubMessages.mockResolvedValueOnce({
      messages: [message({ id: "incoming", body: "Новое внизу", createdAt: "2026-07-28T12:01:00.000Z" }), message()],
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: false
    });

    document.dispatchEvent(new Event("visibilitychange"));
    await screen.findByText("Новое внизу");
    await nextTick();

    expect(scrollTop).toBe(100);
    expect(screen.getByRole("button", { name: "Перейти к новым сообщениям" }).textContent).toContain("1");
  });

  it("restores the visible message offset instead of the total height delta after history prepends", async () => {
    apiMocks.getClubMessages
      .mockResolvedValueOnce({ messages: [message()], nextCursor: "older", mutedUntil: null, mutedPermanently: false })
      .mockResolvedValueOnce({
        messages: [message({ id: "older", body: "Более раннее" })],
        nextCursor: null,
        mutedUntil: null,
        mutedPermanently: false
      });
    await renderCommunity();
    const container = document.querySelector<HTMLElement>(".chat-messages")!;
    let scrollTop = 100;
    Object.defineProperties(container, {
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } },
      scrollHeight: { configurable: true, get: () => document.getElementById("chat-message-older") ? 1120 : 1000 },
      clientHeight: { configurable: true, value: 300 }
    });
    container.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} });
    const anchor = document.getElementById("chat-message-message-1")!;
    anchor.getBoundingClientRect = () => {
      const top = document.getElementById("chat-message-older") ? 100 : 40;
      return { top, bottom: top + 60, left: 0, right: 300, width: 300, height: 60, x: 0, y: top, toJSON() {} };
    };

    await fireEvent.click(screen.getByRole("button", { name: "Показать предыдущие сообщения" }));
    await screen.findByText("Более раннее");

    expect(scrollTop).toBe(160);
  });

  it("loads enough history to position the divider at the true first unread message", async () => {
    const recentMessages = Array.from({ length: 50 }, (_, index) => message({
      id: `recent-${index}`,
      body: `Новое ${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 28, 12, index)).toISOString()
    })).reverse();
    const firstUnread = message({
      id: "first-unread",
      body: "Самое раннее непрочитанное",
      createdAt: "2026-07-28T11:59:00.000Z"
    });
    const observedIds: string[] = [];
    const observerCreated = vi.fn();
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: class {
        constructor() { observerCreated(); }
        observe(element: Element) { observedIds.push(element.id); }
        disconnect() {}
      }
    });
    let resolveOlder!: (value: {
      messages: ClubMessage[];
      nextCursor: null;
      mutedUntil: null;
      mutedPermanently: false;
    }) => void;
    apiMocks.getCommunityTopics.mockResolvedValue({ topics: [{ ...topic, unreadCount: 51, messagesCount: 51 }] });
    apiMocks.getClubMessages
      .mockResolvedValueOnce({
        messages: recentMessages,
        nextCursor: "2026-07-28T11:59:00.000Z",
        mutedUntil: null,
        mutedPermanently: false
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve; }));

    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).user = adminUser();
    render(CommunitySection, { global: { plugins: [pinia] } });
    await fireEvent.click(await screen.findByRole("button", { name: /Общий чат/ }));
    await waitFor(() => expect(apiMocks.getClubMessages).toHaveBeenCalledTimes(2));
    expect(observerCreated).not.toHaveBeenCalled();
    resolveOlder({ messages: [firstUnread], nextCursor: null, mutedUntil: null, mutedPermanently: false });

    await screen.findByText("Самое раннее непрочитанное");

    await waitFor(() => expect(observerCreated).toHaveBeenCalledTimes(1));
    expect(observedIds).toContain("chat-message-first-unread");
    const divider = screen.getByText("Новые сообщения");
    expect(divider.compareDocumentPosition(document.getElementById("chat-message-first-unread")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("loads authoritative mute state before opening a message from search", async () => {
    apiMocks.getClubMessages.mockResolvedValueOnce({
      messages: [message()],
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: true
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).user = adminUser();
    render(CommunitySection, { global: { plugins: [pinia] } });
    await waitFor(() => expect(apiMocks.getCommunityTopics).toHaveBeenCalledTimes(1));

    await fireEvent.click(screen.getByRole("button", { name: "Поиск сообщений" }));
    await fireEvent.update(screen.getByRole("searchbox", { name: "Поиск сообщений" }), "сообщение");
    await waitFor(() => expect(apiMocks.searchCommunityMessages).toHaveBeenCalledTimes(1));
    await fireEvent.click(await screen.findByRole("button", { name: /Сообщение для модерации/ }));

    expect(await screen.findByText(/Бессрочный мут/)).toBeTruthy();
    expect(screen.queryByPlaceholderText("Сообщение")).toBeNull();
  });

  it("opens an oldest-to-newest search context and highlights the mounted target message", async () => {
    const oldest = message({ id: "context-oldest", body: "Первое в контексте", createdAt: "2026-07-28T11:58:00.000Z" });
    const target = message({ id: "message-1", body: "Искомое в контексте", createdAt: "2026-07-28T11:59:00.000Z" });
    const newest = message({ id: "context-newest", body: "Последнее в контексте", createdAt: "2026-07-28T12:00:00.000Z" });
    apiMocks.getCommunityMessageContext.mockResolvedValue({
      targetMessageId: target.id,
      messages: [oldest, target, newest]
    });
    apiMocks.getClubMessages.mockResolvedValue({
      messages: [newest, target, oldest],
      nextCursor: null,
      mutedUntil: null,
      mutedPermanently: false
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).user = adminUser();
    render(CommunitySection, { global: { plugins: [pinia] } });
    await waitFor(() => expect(apiMocks.getCommunityTopics).toHaveBeenCalledTimes(1));

    await fireEvent.click(screen.getByRole("button", { name: "Поиск сообщений" }));
    await fireEvent.update(screen.getByRole("searchbox", { name: "Поиск сообщений" }), "сообщение");
    await waitFor(() => expect(apiMocks.searchCommunityMessages).toHaveBeenCalledTimes(1));
    await fireEvent.click(await screen.findByRole("button", { name: /Сообщение для модерации/ }));

    await screen.findByText("Искомое в контексте");
    expect([...document.querySelectorAll(".chat-message-body")].map((element) => element.textContent)).toEqual([
      "Первое в контексте",
      "Искомое в контексте",
      "Последнее в контексте"
    ]);
    await waitFor(() => expect(document.getElementById("chat-message-message-1")?.classList.contains("chat-message-jump-highlight")).toBe(true));
  });

  it("isolates the search dialog and restores focus to its invoking control", async () => {
    Object.defineProperty(HTMLElement.prototype, "getClientRects", {
      configurable: true,
      value: () => ({ length: 1 })
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).user = adminUser();
    render(CommunitySection, { global: { plugins: [pinia] } });
    const trigger = await screen.findByRole("button", { name: "Поиск сообщений" });

    await fireEvent.click(trigger);
    const searchbox = screen.getByRole("searchbox", { name: "Поиск сообщений" });
    await waitFor(() => expect(document.activeElement).toBe(searchbox));
    const background = document.querySelector<HTMLElement>(".community-section-content")!;
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(background.hasAttribute("inert")).toBe(true);

    const topicFilter = screen.getByRole("combobox", { name: "Искать в теме" });
    (topicFilter as HTMLElement).focus();
    await fireEvent.keyDown(topicFilter, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Закрыть поиск" }));

    await fireEvent.keyDown(screen.getByRole("dialog", { name: "Поиск сообщений" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Поиск сообщений" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(background.hasAttribute("inert")).toBe(false);
    expect(background.hasAttribute("aria-hidden")).toBe(false);

    await fireEvent.click(screen.getByRole("button", { name: /Общий чат/ }));
    await screen.findByText("Сообщение для модерации");
    const roomTrigger = screen.getByRole("button", { name: "Поиск сообщений" });
    await fireEvent.click(roomTrigger);
    const room = document.querySelector<HTMLElement>(".chat-room")!;
    expect(room.hasAttribute("inert")).toBe(true);
    expect(room.getAttribute("aria-hidden")).toBe("true");
    await fireEvent.keyDown(screen.getByRole("dialog", { name: "Поиск сообщений" }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(roomTrigger));
    expect(room.hasAttribute("inert")).toBe(false);
    expect(room.hasAttribute("aria-hidden")).toBe(false);
  });
});
