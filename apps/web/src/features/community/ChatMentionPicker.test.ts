import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  });
});
