import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubMessage } from "@club/shared";
import ChatComposer from "./ChatComposer.vue";

const apiMocks = vi.hoisted(() => ({
  getCommunityParticipants: vi.fn()
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    getCommunityParticipants: apiMocks.getCommunityParticipants
  };
});

const participant = {
  id: "00000000-0000-4000-8000-000000000002",
  telegramId: "anna@example.com",
  firstName: "Анна",
  username: "anna",
  displayName: "Анна",
  photoUrl: null,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarScale: 1
};
const secondParticipant = { ...participant, id: "00000000-0000-4000-8000-000000000003", displayName: "Алёна", firstName: "Алёна" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function props(draft = "") {
  return {
    canWrite: true,
    isMuted: false,
    muteComposerText: "",
    unavailableComposerText: "",
    messageSaving: false,
    replyToMessage: null,
    draft,
    resetVersion: 0,
    editMessage: null
  };
}

beforeEach(() => {
  apiMocks.getCommunityParticipants.mockReset().mockResolvedValue({ participants: [participant] });
});

afterEach(cleanup);

describe("community mention picker", () => {
  it("opens a bounded accessible picker for a bare at-sign", async () => {
    render(ChatComposer, { props: props() });
    const input = screen.getByRole("combobox", { name: "Сообщение" }) as HTMLInputElement;

    await fireEvent.update(input, "@");
    input.setSelectionRange(1, 1);
    await fireEvent.input(input);

    expect(await screen.findByRole("option", { name: /Анна/ })).toBeTruthy();
    expect(apiMocks.getCommunityParticipants).toHaveBeenCalledWith("", 10);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("selects a suggestion from the keyboard and sends the chosen identity with exact ranges", async () => {
    const view = render(ChatComposer, { props: props() });
    const input = screen.getByPlaceholderText("Сообщение") as HTMLInputElement;

    await fireEvent.update(input, "@Ан");
    input.setSelectionRange(3, 3);
    await fireEvent.input(input);

    const option = await screen.findByRole("option", { name: /Анна/ });
    expect(option).toBeTruthy();
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("@Анна ");
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(view.emitted()["send-text"]).toEqual([[
      "@Анна",
      [{ userId: participant.id, displayName: "Анна", start: 0, end: 5 }]
    ]]);
  });

  it("rebases a selected identity when text is inserted before it and drops it when its token is edited", async () => {
    const view = render(ChatComposer, { props: props() });
    const input = screen.getByPlaceholderText("Сообщение") as HTMLInputElement;
    await fireEvent.update(input, "@Ан");
    input.setSelectionRange(3, 3);
    await fireEvent.input(input);
    await fireEvent.click(await screen.findByRole("option", { name: /Анна/ }));

    await fireEvent.update(input, "Привет @Анна ");
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(view.emitted()["send-text"]?.at(-1)).toEqual([
      "Привет @Анна",
      [{ userId: participant.id, displayName: "Анна", start: 7, end: 12 }]
    ]);

    await fireEvent.update(input, "Привет @Аня ");
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(view.emitted()["send-text"]?.at(-1)).toEqual(["Привет @Аня", []]);
  });

  it("keeps only the first identity when the same participant is selected twice or restored for edit", async () => {
    const view = render(ChatComposer, { props: props() });
    const input = screen.getByPlaceholderText("Сообщение") as HTMLInputElement;
    await fireEvent.update(input, "@Ан");
    input.setSelectionRange(3, 3);
    await fireEvent.input(input);
    await fireEvent.click(await screen.findByRole("option", { name: /Анна/ }));
    await fireEvent.update(input, "@Анна и @Ан");
    input.setSelectionRange(input.value.length, input.value.length);
    await fireEvent.input(input);
    await fireEvent.click(await screen.findByRole("option", { name: /Анна/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(view.emitted()["send-text"]?.at(-1)).toEqual([
      "@Анна и @Анна",
      [{ userId: participant.id, displayName: "Анна", start: 0, end: 5 }]
    ]);

    const duplicateEdit = {
      id: "message-edit",
      mentions: [
        { userId: participant.id, displayName: "Анна", start: 0, end: 5 },
        { userId: participant.id, displayName: "Анна", start: 8, end: 13 }
      ]
    } as ClubMessage;
    await view.rerender({ ...props("@Анна и @Анна"), editMessage: duplicateEdit });
    await fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(view.emitted()["save-edit"]?.at(-1)).toEqual([
      duplicateEdit,
      "@Анна и @Анна",
      [{ userId: participant.id, displayName: "Анна", start: 0, end: 5 }]
    ]);
  });

  it("keeps the draft available when participant lookup fails", async () => {
    apiMocks.getCommunityParticipants.mockRejectedValueOnce(new Error("offline"));
    render(ChatComposer, { props: props() });
    const input = screen.getByPlaceholderText("Сообщение") as HTMLInputElement;

    await fireEvent.update(input, "Текст @Ан");
    input.setSelectionRange(input.value.length, input.value.length);
    await fireEvent.input(input);

    await waitFor(() => expect(apiMocks.getCommunityParticipants).toHaveBeenCalled());
    expect(input.value).toBe("Текст @Ан");
    expect(screen.queryByRole("listbox", { name: "Участники чата" })).toBeNull();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("exposes listbox ownership and active descendant only while suggestions are available", async () => {
    const pending = deferred<{ participants: typeof participant[] }>();
    apiMocks.getCommunityParticipants.mockReturnValueOnce(pending.promise);
    render(ChatComposer, { props: props() });
    const input = screen.getByRole("combobox", { name: "Сообщение" }) as HTMLInputElement;

    await fireEvent.update(input, "@А");
    input.setSelectionRange(2, 2);
    await fireEvent.input(input);
    expect(input.getAttribute("aria-controls")).toBe("chat-mention-listbox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();

    pending.resolve({ participants: [participant, secondParticipant] });
    const listbox = await screen.findByRole("listbox", { name: "Участники чата" });
    expect(listbox.id).toBe("chat-mention-listbox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(`chat-mention-option-${participant.id}`);

    await fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(`chat-mention-option-${secondParticipant.id}`);
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Участники чата" })).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(input.value).toBe("@А");
  });
});
