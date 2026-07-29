import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessageSearchResult } from "@club/shared";
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
});
