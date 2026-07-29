import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubTopic, CommunityMessageSearchResult } from "@club/shared";
import ChatSearchPanel from "./ChatSearchPanel.vue";

const apiMocks = vi.hoisted(() => ({ searchCommunityMessages: vi.fn() }));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  searchCommunityMessages: apiMocks.searchCommunityMessages
}));

const result: CommunityMessageSearchResult = {
  messageId: "00000000-0000-4000-8000-000000000003",
  topicId: "00000000-0000-4000-8000-000000000001",
  topicTitle: "Общий чат",
  author: {
    id: "author-1",
    telegramId: "author@example.com",
    firstName: "Анна",
    username: "anna",
    displayName: "Анна",
    photoUrl: null,
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 1
  },
  excerpt: "Нужное сообщение",
  createdAt: "2026-07-28T12:00:00.000Z"
};

const topic: ClubTopic = {
  id: result.topicId,
  chatId: "chat-1",
  title: result.topicTitle,
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

beforeEach(() => {
  vi.useFakeTimers();
  apiMocks.searchCommunityMessages.mockReset().mockResolvedValue({ results: [result], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("community message search", () => {
  it("debounces a server search and opens the selected result", async () => {
    const openResult = vi.fn().mockResolvedValue(undefined);
    render(ChatSearchPanel, { props: { topics: [], openResult } });

    await fireEvent.update(screen.getByRole("searchbox", { name: "Поиск сообщений" }), "нужное");
    expect(apiMocks.searchCommunityMessages).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(apiMocks.searchCommunityMessages).toHaveBeenCalledWith({ q: "нужное", limit: 20 });

    await fireEvent.click(await screen.findByRole("button", { name: /Нужное сообщение/ }));
    expect(openResult).toHaveBeenCalledWith(result);
  });

  it("removes a stale 404 result without closing the search task", async () => {
    const openResult = vi.fn().mockRejectedValue({ status: 404 });
    render(ChatSearchPanel, { props: { topics: [], openResult } });
    await fireEvent.update(screen.getByRole("searchbox", { name: "Поиск сообщений" }), "нужное");
    await vi.advanceTimersByTimeAsync(300);
    await fireEvent.click(await screen.findByRole("button", { name: /Нужное сообщение/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Сообщение больше недоступно"));
    expect(screen.queryByText("Нужное сообщение")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Поиск сообщений" })).toBeTruthy();
  });

  it("immediately clears results and pagination when the query, topic, or clear action changes", async () => {
    apiMocks.searchCommunityMessages.mockResolvedValue({ results: [result], nextCursor: { createdAt: result.createdAt, id: result.messageId } });
    render(ChatSearchPanel, { props: { topics: [topic], openResult: vi.fn() } });
    const searchbox = screen.getByRole("searchbox", { name: "Поиск сообщений" });

    await fireEvent.update(searchbox, "первый запрос");
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText("Нужное сообщение")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Показать ещё" })).toBeTruthy();

    await fireEvent.update(searchbox, "второй запрос");
    expect(screen.queryByText("Нужное сообщение")).toBeNull();
    expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText("Нужное сообщение")).toBeTruthy();
    await fireEvent.update(screen.getByRole("combobox", { name: "Искать в теме" }), topic.id);
    expect(screen.queryByText("Нужное сообщение")).toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText("Нужное сообщение")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Очистить поиск" }));
    expect(screen.queryByText("Нужное сообщение")).toBeNull();
    expect((searchbox as HTMLInputElement).value).toBe("");
  });

  it("does not render a late response from superseded criteria", async () => {
    let resolveFirst!: (value: { results: CommunityMessageSearchResult[]; nextCursor: null }) => void;
    const secondResult = { ...result, messageId: "message-b", excerpt: "Ответ второго запроса" };
    apiMocks.searchCommunityMessages
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ results: [secondResult], nextCursor: null });
    render(ChatSearchPanel, { props: { topics: [], openResult: vi.fn() } });
    const searchbox = screen.getByRole("searchbox", { name: "Поиск сообщений" });

    await fireEvent.update(searchbox, "первый запрос");
    await vi.advanceTimersByTimeAsync(300);
    await fireEvent.update(searchbox, "второй запрос");
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText("Ответ второго запроса")).toBeTruthy();

    resolveFirst({ results: [result], nextCursor: null });
    await Promise.resolve();
    expect(screen.queryByText("Нужное сообщение")).toBeNull();
    expect(screen.getByText("Ответ второго запроса")).toBeTruthy();
  });

  it("uses one deterministic accessible clear control", async () => {
    render(ChatSearchPanel, { props: { topics: [], openResult: vi.fn() } });
    const searchbox = screen.getByRole("searchbox", { name: "Поиск сообщений" }) as HTMLInputElement;
    expect(searchbox.type).toBe("text");

    await fireEvent.update(searchbox, "текст");
    expect(screen.getAllByRole("button", { name: "Очистить поиск" })).toHaveLength(1);
  });
});
